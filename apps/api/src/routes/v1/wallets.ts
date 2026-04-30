import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { SolanaAddressSchema } from "@get-toasted/schemas";
import { wallets as walletsTbl, detectedSandwiches, scanJobs } from "@get-toasted/db";
import { eq, desc, and, gte, lte, count } from "drizzle-orm";
import { Queue } from "bullmq";
import { z } from "zod";
import { db, redis } from "../../lib/connections.js";
import { authMiddleware } from "../../middleware/auth.js";

const scanQueue = new Queue("scan-historical", { connection: redis });

const AddressParam = z.object({ address: SolanaAddressSchema });

const SandwichesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
});

export const wallets = new Hono();

// GET /api/v1/wallets/:address — public wallet overview
wallets.get("/:address", zValidator("param", AddressParam), async (c) => {
  const { address } = c.req.valid("param");

  const [wallet] = await db
    .select()
    .from(walletsTbl)
    .where(eq(walletsTbl.address, address))
    .limit(1);

  if (!wallet) return c.json({ error: "not_found" }, 404);

  const sandwiches = await db
    .select()
    .from(detectedSandwiches)
    .where(eq(detectedSandwiches.victimWallet, address))
    .orderBy(desc(detectedSandwiches.blockTime))
    .limit(20);

  return c.json({
    wallet,
    sandwiches,
    totalLossUsd: wallet.totalLossUsd ?? "0",
    scanStatus: wallet.scanStatus,
  });
});

// GET /api/v1/wallets/:address/sandwiches — paginated sandwich history
wallets.get(
  "/:address/sandwiches",
  zValidator("param", AddressParam),
  zValidator("query", SandwichesQuery),
  async (c) => {
    const { address } = c.req.valid("param");
    const { limit, offset, fromDate, toDate } = c.req.valid("query");

    const conditions = [eq(detectedSandwiches.victimWallet, address)];
    if (fromDate) conditions.push(gte(detectedSandwiches.blockTime, new Date(fromDate)));
    if (toDate) conditions.push(lte(detectedSandwiches.blockTime, new Date(toDate)));
    const where = and(...conditions);

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(detectedSandwiches)
        .where(where)
        .orderBy(desc(detectedSandwiches.blockTime))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(detectedSandwiches).where(where),
    ]);

    const total = totalResult[0]?.total ?? 0;

    return c.json({
      data,
      total: Number(total),
      hasMore: offset + data.length < Number(total),
    });
  },
);

// POST /api/v1/wallets/:address/scan — protected, enqueue historical scan
wallets.post(
  "/:address/scan",
  authMiddleware,
  zValidator("param", AddressParam),
  async (c) => {
    const { address } = c.req.valid("param");
    const userId = c.get("wallet") as string;

    // Check if scan already in progress
    const locked = await redis.get(`scan:lock:${address}`);
    if (locked) {
      return c.json({ error: "scan_already_running" }, 409);
    }

    // Upsert wallet row
    await db
      .insert(walletsTbl)
      .values({ address, scanStatus: "pending" })
      .onConflictDoUpdate({
        target: walletsTbl.address,
        set: { scanStatus: "pending" },
      });

    // Insert scan job record
    const [job] = await db
      .insert(scanJobs)
      .values({ wallet: address, status: "pending", startedAt: new Date() })
      .returning({ id: scanJobs.id });

    // Enqueue BullMQ job
    const bullJob = await scanQueue.add(
      "scan",
      { wallet: address, userId, jobId: job!.id },
      { jobId: job!.id },
    );

    return c.json({ scanId: bullJob.id, status: "queued" }, 202);
  },
);

// Needed for auth middleware context typing
declare module "hono" {
  interface ContextVariableMap {
    wallet: string;
  }
}
