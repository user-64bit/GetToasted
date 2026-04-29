import { Hono } from "hono";

export const webhooks = new Hono();

// POST /api/webhooks/helius — Helius enhanced transaction webhook
webhooks.post("/helius", async (c) => {
  const secret = c.req.header("authorization");
  if (secret !== `Bearer ${process.env.HELIUS_WEBHOOK_SECRET}`) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const body = await c.req.json();
  // TODO: parse enhanced transactions, enqueue to scan-realtime BullMQ queue
  console.log("Helius webhook received:", Array.isArray(body) ? body.length : 1, "txns");

  return c.json({ ok: true });
});
