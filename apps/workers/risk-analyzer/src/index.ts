import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";
import { createDb, detectedSandwiches, pools } from "@get-toasted/db";
import { gte, sql } from "drizzle-orm";

const REDIS_URL = process.env.REDIS_URL;
const DATABASE_URL = process.env.DATABASE_URL;

if (!REDIS_URL || !DATABASE_URL) {
  throw new Error("Missing required env vars: REDIS_URL, DATABASE_URL");
}

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const db = createDb(DATABASE_URL);

// Schedule recurring job every hour if not already registered
const scheduler = new Queue("risk-score", { connection });
await scheduler.upsertJobScheduler(
  "risk-score-hourly",
  { every: 60 * 60 * 1000 },
  { name: "sweep" },
);

new Worker(
  "risk-score",
  async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Aggregate sandwich counts and avg loss per pool over last 7 days
    const stats = await db
      .select({
        pool: detectedSandwiches.pool,
        dex: detectedSandwiches.dex,
        cnt: sql<number>`COUNT(*)::int`,
        avgLoss: sql<string>`AVG(loss_usd)::text`,
      })
      .from(detectedSandwiches)
      .where(gte(detectedSandwiches.blockTime, sevenDaysAgo))
      .groupBy(detectedSandwiches.pool, detectedSandwiches.dex);

    for (const row of stats) {
      const riskScore = Math.min(row.cnt / 100.0, 1.0).toFixed(2);
      await db
        .insert(pools)
        .values({
          address: row.pool,
          dex: row.dex,
          tokenAMint: "",
          tokenBMint: "",
          sandwichCount7d: row.cnt,
          riskScore,
          lastRefreshed: new Date(),
        })
        .onConflictDoUpdate({
          target: pools.address,
          set: {
            sandwichCount7d: row.cnt,
            riskScore,
            lastRefreshed: new Date(),
          },
        });
    }

    console.log(`risk-analyzer: updated ${stats.length} pools`);
    return { processed: stats.length };
  },
  { connection, concurrency: 2 },
);

console.log("risk-analyzer worker up — consuming queue: risk-score");
