import { serverEnv } from "@get-toasted/env";
import { createDb, type Db } from "@get-toasted/db";
import { HeliusClient } from "@get-toasted/helius";
import {
  createBlockTimeResolver,
  createDecimalsResolver,
  createLeaderScheduleCache,
  createPriceClient,
  createWebhookManager,
} from "@get-toasted/runtime";
import IORedis from "ioredis";

export const db: Db = createDb(serverEnv.DATABASE_URL);

export const redis = new IORedis(serverEnv.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const helius = new HeliusClient(
  serverEnv.HELIUS_API_KEY,
  serverEnv.HELIUS_RPC_URL,
);

const rpcUrl =
  serverEnv.HELIUS_RPC_URL ??
  `https://mainnet.helius-rpc.com/?api-key=${serverEnv.HELIUS_API_KEY}`;

export const leaderSchedule = createLeaderScheduleCache({ redis, helius });
export const priceClient = createPriceClient({
  redis,
  jupiterApiKey: serverEnv.JUPITER_API_KEY,
});
export const blockTime = createBlockTimeResolver({ redis, rpcUrl });
export const decimalsCache = createDecimalsResolver({ redis, rpcUrl });
export const webhookManager = createWebhookManager({
  helius,
  redis,
  apiBaseUrl: serverEnv.API_BASE_URL ?? serverEnv.APP_URL,
  webhookSecret: serverEnv.HELIUS_WEBHOOK_SECRET,
  webhookId: serverEnv.HELIUS_WEBHOOK_ID,
});
