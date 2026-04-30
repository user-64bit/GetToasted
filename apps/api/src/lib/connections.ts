import { serverEnv } from "@get-toasted/env";
import { createDb } from "@get-toasted/db";
import IORedis from "ioredis";

// Module-level singletons — validated at startup via serverEnv
export const db = createDb(serverEnv.DATABASE_URL);

export const redis = new IORedis(serverEnv.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});
