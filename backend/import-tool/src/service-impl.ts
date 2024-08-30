import type { IFileReaderData } from "./utils/file-reader.js";
import type { IEncryptedElm } from "./utils/crypto-node-util.js";
import type { IImportStats } from "./input-schema.js";
import type { IImportFilesState } from "./state.js";

import path from "path";
import { z } from "zod";
import _ from "lodash";
import { Socket } from "socket.io";

import { RedisWrapper } from "./utils/redis.js";
import {
  readFiles,
  readFilesExt,
  readSingleFileFromPaths,
} from "./utils/file-reader.js";
import { LoggerCls } from "./utils/logger.js";
import { runJSFunction, validateJS } from "./utils/validate-js.js";
import { DISABLE_JS_FLAGS } from "./utils/constants.js";
import { decryptData } from "./utils/crypto-node-util.js";

import * as InputSchemas from "./input-schema.js";
import { socketState, ImportStatus } from "./state.js";

const getInputRedisConUrl = (
  redisConUrl?: string,
  redisConUrlEncrypted?: IEncryptedElm
) => {
  if (!redisConUrl && redisConUrlEncrypted) {
    redisConUrl = decryptData(redisConUrlEncrypted);
  }

  if (!redisConUrl) {
    throw new Error("Redis connection URL is missing !");
  }
  return redisConUrl;
};

const testRedisConnection = async (
  input: z.infer<typeof InputSchemas.testRedisConnectionSchema>
) => {
  InputSchemas.testRedisConnectionSchema.parse(input); // validate input

  let redisConUrl = getInputRedisConUrl(
    input.redisConUrl,
    input.redisConUrlEncrypted
  );

  const redisWrapper = new RedisWrapper(redisConUrl);

  await redisWrapper.connect();
  await redisWrapper.client?.ping();
  await redisWrapper.disconnect();

  return "Connection to Redis successful !";
};

//#region importFilesToRedis

const getJSONGlob = (serverFolderPath: string) => {
  if (serverFolderPath.match(/\\/)) {
    //windows OS path
    serverFolderPath = serverFolderPath.replace(/\\/g, "/");
  }
  if (!serverFolderPath.endsWith("/")) {
    serverFolderPath += "/";
  }
  let jsonGlob = serverFolderPath + "**/*.json";
  let jsonGzGlob = serverFolderPath + "**/*.json.gz";
  return [jsonGlob, jsonGzGlob];
};

const getFileKey = (
  filePath: string,
  idField: string = "",
  content: any,
  keyPrefix: string = ""
) => {
  let key = "";
  if (idField && content) {
    // JSON id field as key
    //key = content[idField];
    key = _.get(content, idField); // to support nested id with dot
  } else {
    // filename as key (default)
    if (filePath.endsWith(".json.gz")) {
      key = path.basename(filePath, ".json.gz");
    } else if (filePath.endsWith(".json")) {
      key = path.basename(filePath, ".json");
    } else {
      key = path.basename(filePath);
    }
  }

  key = keyPrefix ? keyPrefix + key : key;

  return key;
};

const updateStatsAndErrors = (
  data: IFileReaderData,
  storeStats?: IImportStats,
  storeFileErrors?: any[]
) => {
  if (data && storeStats && storeFileErrors) {
    storeStats.totalFiles = data.totalFiles;
    if (data.error) {
      storeStats.failed++;

      const fileError = {
        filePath: data.filePath,
        error: data.error,
      };
      storeFileErrors.push(fileError);
    } else {
      storeStats.processed++;
    }
  }
};
const emitSocketMessages = (info: {
  socketClient?: Socket | null;
  stats?: IImportStats;
  data?: IFileReaderData;
  currentStatus?: ImportStatus;
}) => {
  if (info?.socketClient) {
    if (info.stats) {
      info.socketClient.emit("importStats", info.stats);
    }

    if (info.data?.error) {
      const fileError = {
        filePath: info.data.filePath,
        error: info.data.error,
      };
      info.socketClient.emit("importFileError", fileError);
    }

    if (info.currentStatus) {
      info.socketClient.emit("importStatus", info.currentStatus);
    }
  }
};

const processFileData = async (
  data: IFileReaderData,
  redisWrapper: RedisWrapper,
  input: z.infer<typeof InputSchemas.importFilesToRedisSchema>
) => {
  if (data?.content) {
    let key = getFileKey(
      data.filePath,
      input.idField,
      data.content,
      input.keyPrefix
    );

    const isKeyExists = await redisWrapper.client?.exists(key);
    await redisWrapper.client?.json.set(key, ".", data.content);
    if (isKeyExists) {
      LoggerCls.info(`Updated file: ${data.filePath}`);
    } else {
      LoggerCls.log(`Added file: ${data.filePath}`);
    }
  }
};

const setImportTimeAndStatus = (
  startTimeInMs: number,
  importState: IImportFilesState
) => {
  if (importState?.stats) {
    const endTimeInMs = performance.now();
    importState.stats.totalTimeInMs = Math.round(endTimeInMs - startTimeInMs);
    LoggerCls.info(`Time taken: ${importState.stats.totalTimeInMs} ms`);

    if (importState.currentStatus == ImportStatus.IN_PROGRESS) {
      const failed = importState.stats.failed;
      const processed = importState.stats.processed;
      const totalFiles = importState.stats.totalFiles;
      if (processed == totalFiles) {
        importState.currentStatus = ImportStatus.SUCCESS;
      } else {
        importState.currentStatus = ImportStatus.PARTIAL_SUCCESS;
      }
    }

    emitSocketMessages({
      socketClient: importState.socketClient,
      stats: importState.stats,
      currentStatus: importState.currentStatus,
    });
  }
};

const formatJSONContent = async (
  data: IFileReaderData,
  importState: IImportFilesState
) => {
  if (importState.input?.jsFunctionString && data?.content) {
    const jsFunctionString = importState.input.jsFunctionString;

    const modifiedContent = await runJSFunction(
      jsFunctionString,
      data.content,
      true,
      null
    );
    if (modifiedContent) {
      data.content = modifiedContent;
    }
  }
};

const readEachFileCallback = async (
  data: IFileReaderData,
  redisWrapper: RedisWrapper,
  input: z.infer<typeof InputSchemas.importFilesToRedisSchema>,
  importState: IImportFilesState
) => {
  await formatJSONContent(data, importState);

  await processFileData(data, redisWrapper, input);

  updateStatsAndErrors(data, importState.stats, importState.fileErrors);
  emitSocketMessages({
    socketClient: importState.socketClient,
    stats: importState.stats,
    data,
  });
  importState.filePathIndex = data.filePathIndex;

  if (data?.error && input.isStopOnError) {
    importState.currentStatus = ImportStatus.ERROR_STOPPED;
  } else if (importState.isPaused) {
    importState.currentStatus = ImportStatus.PAUSED;
  }
};

const importFilesToRedis = async (
  input: z.infer<typeof InputSchemas.importFilesToRedisSchema>
) => {
  InputSchemas.importFilesToRedisSchema.parse(input); // validate input

  if (input.jsFunctionString) {
    let disableFlags = DISABLE_JS_FLAGS;
    //disableFlags.NAMES_CONSOLE = false; // allow console.log
    validateJS(input.jsFunctionString, disableFlags);
  }

  let startTimeInMs = 0;
  let importState: IImportFilesState = {};

  if (input.socketId) {
    if (!socketState[input.socketId]) {
      socketState[input.socketId] = {};
    }
    importState = socketState[input.socketId];
  }

  importState.input = input;
  importState.stats = {
    totalFiles: 0,
    processed: 0,
    failed: 0,
    totalTimeInMs: 0,
  };
  importState.fileErrors = [];
  importState.filePaths = [];
  importState.filePathIndex = 0;

  let redisConUrl = getInputRedisConUrl(
    input.redisConUrl,
    input.redisConUrlEncrypted
  );
  const redisWrapper = new RedisWrapper(redisConUrl);
  await redisWrapper.connect();

  const jsonGlobArr = getJSONGlob(input.serverFolderPath);

  startTimeInMs = performance.now();
  importState.isPaused = false;
  importState.currentStatus = ImportStatus.IN_PROGRESS;
  emitSocketMessages({
    socketClient: importState.socketClient,
    currentStatus: importState.currentStatus,
  });

  let allFilesPromObj: any = readFiles(
    jsonGlobArr,
    [],
    input.isStopOnError,
    importState.filePaths,
    importState,
    async (data) => {
      await readEachFileCallback(data, redisWrapper, input, importState);
    }
  );

  allFilesPromObj = allFilesPromObj.then(() => {
    setImportTimeAndStatus(startTimeInMs, importState);
    return redisWrapper.disconnect();
  });

  await allFilesPromObj;
  return {
    stats: importState.stats,
    fileErrors: importState.fileErrors,
    currentStatus: importState.currentStatus,
  };
};

const resumeImportFilesToRedis = async (
  resumeInput: z.infer<typeof InputSchemas.resumeImportFilesToRedisSchema>
) => {
  InputSchemas.resumeImportFilesToRedisSchema.parse(resumeInput); // validate input

  let startTimeInMs = 0;
  let importState: IImportFilesState = {};
  let allFilesPromObj: Promise<any> = Promise.resolve();

  if (resumeInput.socketId && socketState[resumeInput.socketId]) {
    importState = socketState[resumeInput.socketId];

    if (importState.currentStatus == ImportStatus.IN_PROGRESS) {
      throw new Error("Import is already in progress for this socketId");
    }

    if (importState.input && importState.filePaths?.length) {
      importState.input.isStopOnError = resumeInput.isStopOnError;

      //if error occurred, resume from last file
      let filePathIndex = importState.filePathIndex || 0;
      if (importState.currentStatus == ImportStatus.PAUSED) {
        // if paused, resume from next file
        filePathIndex++;
      }

      let input = importState.input;

      let redisConUrl = getInputRedisConUrl(
        input.redisConUrl,
        input.redisConUrlEncrypted
      );
      const redisWrapper = new RedisWrapper(redisConUrl);
      await redisWrapper.connect();

      startTimeInMs = performance.now();
      importState.isPaused = false;
      importState.currentStatus = ImportStatus.IN_PROGRESS;
      emitSocketMessages({
        socketClient: importState.socketClient,
        currentStatus: importState.currentStatus,
      });

      allFilesPromObj = readFilesExt(
        importState.filePaths,
        input.isStopOnError,
        filePathIndex,
        importState,
        async (data) => {
          await readEachFileCallback(data, redisWrapper, input, importState);
        }
      );

      allFilesPromObj = allFilesPromObj.then(() => {
        setImportTimeAndStatus(startTimeInMs, importState);
        return redisWrapper.disconnect();
      });
    }
  }

  await allFilesPromObj;
  return {
    stats: importState.stats,
    fileErrors: importState.fileErrors,
    currentStatus: importState.currentStatus,
  };
};

//#endregion

const testJSONFormatterFn = async (
  input: z.infer<typeof InputSchemas.testJSONFormatterFnSchema>
) => {
  InputSchemas.testJSONFormatterFnSchema.parse(input); // validate input

  let disableFlags = DISABLE_JS_FLAGS;
  //disableFlags.NAMES_CONSOLE = false; // allow console.log

  const functionResult = await runJSFunction(
    input.jsFunctionString,
    input.paramsObj,
    false,
    disableFlags
  );

  return functionResult;
};

const getSampleInputForJSONFormatterFn = async (
  input: z.infer<typeof InputSchemas.getSampleInputForJSONFormatterFnSchema>
) => {
  InputSchemas.getSampleInputForJSONFormatterFnSchema.parse(input); // validate input

  const jsonGlobArr = getJSONGlob(input.serverFolderPath);
  const { filePath, content, error } = await readSingleFileFromPaths(
    jsonGlobArr,
    []
  );

  if (error) {
    throw error;
  }
  return { filePath, content };
};

export {
  testRedisConnection,
  importFilesToRedis,
  resumeImportFilesToRedis,
  testJSONFormatterFn,
  getSampleInputForJSONFormatterFn,
};
