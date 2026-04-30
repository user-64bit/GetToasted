import { Hono } from "hono";
import { Queue } from "bullmq";
import { serverEnv } from "@get-toasted/env";
import { redis } from "../../lib/connections.js";

const realtimeQueue = new Queue("scan-realtime", { connection: redis });

export const webhooks = new Hono();

// POST /api/webhooks/helius — Helius enhanced transaction webhook receiver
webhooks.post("/helius", async (c) => {
  const secret = c.req.header("authorization");
  if (secret !== serverEnv.HELIUS_WEBHOOK_SECRET) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const body = (await c.req.json()) as Array<{ type?: string; [k: string]: unknown }>;
  if (!Array.isArray(body)) return c.json({ error: "invalid_payload" }, 400);

  const swaps = body.filter((tx) => tx.type === "SWAP");
  for (const tx of swaps) {
    await realtimeQueue.add("detect", { transaction: tx });
  }

  return c.json({ received: swaps.length });
});
