import type { Redis } from "ioredis";
import type { HeliusClient, WebhookConfig } from "@get-toasted/helius";
import { SystemConfig, type Db } from "@get-toasted/db";
import { logger } from "./logger.js";
import { redisKeys } from "./redis-keys.js";

export type WebhookManagerOptions = {
  helius: HeliusClient;
  redis: Redis;
  db: Db;
  apiBaseUrl: string;
  webhookSecret: string;
  webhookId?: string;
};

export function createWebhookManager(opts: WebhookManagerOptions) {
  const {
    helius,
    redis,
    db,
    apiBaseUrl,
    webhookSecret,
    webhookId: envWebhookId,
  } = opts;

  const resolveWebhookId = async (): Promise<string | null> => {
    if (envWebhookId) return envWebhookId;
    const cached = await redis.get(redisKeys.webhookId());
    if (cached) return cached;
    const persisted = await SystemConfig.getConfigValue(
      db,
      SystemConfig.HELIUS_WEBHOOK_ID_KEY,
    );
    if (persisted) {
      await redis.set(redisKeys.webhookId(), persisted);
    }
    return persisted;
  };

  const ensureWebhook = async (): Promise<string> => {
    const existing = await resolveWebhookId();
    if (existing) return existing;

    const config: WebhookConfig = {
      webhookURL: `${apiBaseUrl.replace(/\/$/, "")}/api/webhooks/helius`,
      transactionTypes: ["SWAP"],
      accountAddresses: [],
      webhookType: "enhanced",
      authHeader: webhookSecret,
    };
    const id = await helius.createWebhook(config);
    await SystemConfig.setConfigValue(db, SystemConfig.HELIUS_WEBHOOK_ID_KEY, id);
    await redis.set(redisKeys.webhookId(), id);
    logger.info(
      { webhookId: id },
      "webhook-manager: created new Helius webhook (persisted to DB)",
    );
    return id;
  };

  return {
    async registerWallet(address: string): Promise<void> {
      const id = await ensureWebhook();
      try {
        await helius.addWebhookAddresses(id, [address]);
        logger.info({ wallet: address, webhookId: id }, "webhook-manager: wallet registered");
      } catch (err) {
        logger.error({ err, wallet: address }, "webhook-manager: registration failed");
        throw err;
      }
    },

    async unregisterWallet(address: string): Promise<void> {
      const id = await resolveWebhookId();
      if (!id) return;
      await helius.removeWebhookAddresses(id, [address]);
      logger.info({ wallet: address }, "webhook-manager: wallet unregistered");
    },

    async getWebhookId(): Promise<string | null> {
      return resolveWebhookId();
    },
  };
}

export type WebhookManager = ReturnType<typeof createWebhookManager>;
