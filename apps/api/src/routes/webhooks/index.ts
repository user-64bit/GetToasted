import { Hono } from "hono";
import { Queue } from "bullmq";
import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@get-toasted/env";
import type { HeliusEnhancedTransaction } from "@get-toasted/helius";
import { logger } from "@get-toasted/runtime";
import { redis } from "../../lib/connections.js";

const realtimeQueue = new Queue("scan-realtime", { connection: redis });

export const webhooks = new Hono();

function authValid(header: string | undefined): boolean {
  if (!header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(serverEnv.HELIUS_WEBHOOK_SECRET);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

webhooks.post("/helius", async (c) => {
  if (!authValid(c.req.header("authorization"))) {
    return c.json({ error: "unauthorized", code: "WEBHOOK_AUTH_INVALID" }, 401);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  if (!Array.isArray(body)) {
    return c.json({ error: "invalid_payload", code: "WEBHOOK_NOT_ARRAY" }, 400);
  }

  const txs = body as HeliusEnhancedTransaction[];
  const swaps = txs.filter((tx) => tx?.type === "SWAP");

  for (const tx of swaps) {
    await realtimeQueue.add(
      "detect",
      { transaction: tx },
      {
        jobId: `realtime:${tx.signature}`,
        removeOnComplete: { age: 60 * 60, count: 1000 },
        removeOnFail: { age: 6 * 60 * 60 },
      },
    );
  }

  logger.info(
    { received: txs.length, enqueued: swaps.length },
    "webhook: helius batch received",
  );

  return c.json({ received: txs.length, enqueued: swaps.length });
});
