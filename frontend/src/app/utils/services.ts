import { z } from "zod";

import { postRequest } from "./axios-util";

//#region API input schema
const testRedisConnectionSchema = z.object({
  redisConUrl: z.string(),
});

const importFilesToRedisSchema = z.object({
  redisConUrl: z.string(),
  serverFolderPath: z.string(),
  socketId: z.string().optional(),
  idField: z.string().optional(),
  keyPrefix: z.string().optional(),
});

//#endregion

//#region API calls
const testRedisConnection = async (
  input: z.infer<typeof testRedisConnectionSchema>
) => {
  testRedisConnectionSchema.parse(input); // validate input //TODO: handle catch
  const response = await postRequest("/testRedisConnection", input);
  return response?.data;
};

const importFilesToRedis = async (
  input: z.infer<typeof importFilesToRedisSchema>
) => {
  importFilesToRedisSchema.parse(input); // validate input //TODO: handle catch
  const response = await postRequest("/importFilesToRedis", input);
  return response?.data;
};
//#endregion

export { testRedisConnection, importFilesToRedis };
