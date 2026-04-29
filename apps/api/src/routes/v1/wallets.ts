import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { SolanaAddressSchema } from "@get-toasted/schemas";
import { z } from "zod";

export const wallets = new Hono();

// GET /api/v1/wallets/:address — return sandwiches for a victim wallet
wallets.get(
  "/:address",
  zValidator("param", z.object({ address: SolanaAddressSchema })),
  async (c) => {
    const { address } = c.req.valid("param");
    // TODO: query db for detected_sandwiches WHERE victim_wallet = address
    return c.json({
      address,
      sandwiches: [],
      totalLossUsd: "0",
      scanStatus: "pending",
    });
  },
);

// POST /api/v1/wallets/:address/scan — enqueue a historical scan job
wallets.post(
  "/:address/scan",
  zValidator("param", z.object({ address: SolanaAddressSchema })),
  async (c) => {
    const { address } = c.req.valid("param");
    // TODO: insert wallet into db, enqueue scan-historical BullMQ job
    return c.json({ queued: true, address }, 202);
  },
);
