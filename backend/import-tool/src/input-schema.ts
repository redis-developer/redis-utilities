import { z } from "zod";

export const testRedisConnectionSchema = z.object({
  redisConUrl: z.string(),
});

export const importFilesToRedisSchema = z.object({
  redisConUrl: z.string(),
  serverFolderPath: z.string(),
  socketId: z.string().optional(),
  idField: z.string().optional(),
  keyPrefix: z.string().optional(),
  isStopOnError: z.boolean().optional(),
});

export const resumeImportFilesToRedisSchema = z.object({
  socketId: z.string(),
  isStopOnError: z.boolean().optional(),
});

export const testJSONFormatterFnSchema = z.object({
  jsFunctionString: z.string(),
  paramsObj: z.record(z.string(), z.any()),
});

//--- types ---

interface IImportStats {
  totalFiles: number;
  processed: number;
  failed: number;
  totalTimeInMs: number;
}

export type { IImportStats };
