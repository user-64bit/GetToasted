import type { Redis } from "ioredis";
import type { HeliusClient, WebhookConfig } from "@get-toasted/helius";
import { logger } from "./logger.js";
import { redisKeys } from "./redis-keys.js";

export type WebhookManagerOptions = {
  helius: HeliusClient;
  redis: Redis;
  apiBaseUrl: string;
  webhookSecret: string;
  webhookId?: string;
};

export function createWebhookManager(opts: WebhookManagerOptions) {
  const { helius, redis, apiBaseUrl, webhookSecret, webhookId: envWebhookId } = opts;

  const resolveWebhookId = async (): Promise<string | null> => {
    if (envWebhookId) return envWebhookId;
    const cached = await redis.get(redisKeys.webhookId());
    return cached ?? null;
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
    await redis.set(redisKeys.webhookId(), id);
    logger.warn(
      { webhookId: id },
      "webhook-manager: created new Helius webhook — set HELIUS_WEBHOOK_ID env to persist",
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
