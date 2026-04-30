import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";
import { createDb, validators, detectedSandwiches } from "@get-toasted/db";
import { sql, count } from "drizzle-orm";

const REDIS_URL = process.env.REDIS_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

if (!REDIS_URL || !DATABASE_URL || !HELIUS_API_KEY) {
  throw new Error("Missing required env vars: REDIS_URL, DATABASE_URL, HELIUS_API_KEY");
}

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const db = createDb(DATABASE_URL);

// Schedule recurring job every 24 hours
const scheduler = new Queue("validator-refresh", { connection });
await scheduler.upsertJobScheduler(
  "validator-refresh-daily",
  { every: 24 * 60 * 60 * 1000 },
  { name: "sweep" },
);

new Worker(
  "validator-refresh",
  async () => {
    // 1. Fetch validator list from validators.app
    let validatorList: Array<{
      vote_account: string;
      name?: string;
      commission?: number;
      activated_stake?: number;
      is_jito_validator?: boolean;
    }> = [];

    try {
      const res = await fetch(
        "https://validators.app/api/v1/validators/mainnet.json?limit=1000",
        { headers: { "Token": process.env.VALIDATORS_APP_TOKEN ?? "" } },
      );
      if (res.ok) {
        validatorList = await res.json() as typeof validatorList;
      }
    } catch (err) {
      console.warn("validator-refresh: could not fetch validators.app:", err);
    }

    // 2. Aggregate sandwich counts per validator from our DB
    const sandwichCounts = await db
      .select({
        voteAccount: detectedSandwiches.validatorVote,
        cnt: count(),
      })
      .from(detectedSandwiches)
      .groupBy(detectedSandwiches.validatorVote);

    const countMap = new Map(sandwichCounts.map((r) => [r.voteAccount, Number(r.cnt)]));

    // 3. Upsert validators
    for (const v of validatorList) {
      if (!v.vote_account) continue;
      await db
        .insert(validators)
        .values({
          voteAccount: v.vote_account,
          identityAccount: v.vote_account, // fallback
          name: v.name ?? null,
          sandwichCount: countMap.get(v.vote_account) ?? 0,
          lastUpdatedAt: new Date(),
          metadata: {
            commission: v.commission,
            activatedStake: v.activated_stake,
            isJitoEnabled: v.is_jito_validator ?? false,
          },
        })
        .onConflictDoUpdate({
          target: validators.voteAccount,
          set: {
            name: sql`EXCLUDED.name`,
            sandwichCount: countMap.get(v.vote_account) ?? 0,
            lastUpdatedAt: new Date(),
            metadata: sql`EXCLUDED.metadata`,
          },
        });
    }

    // 4. Cache leader schedule in Redis (3-day TTL)
    try {
      const heliusRpc = process.env.HELIUS_RPC_URL ??
        `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
      const schedRes = await fetch(heliusRpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getLeaderSchedule",
          params: [],
        }),
      });
      if (schedRes.ok) {
        const { result } = await schedRes.json() as { result: Record<string, number[]> };
        if (result) {
          // Invert: slot → vote account
          const inverted: Record<string, string> = {};
          for (const [identity, slots] of Object.entries(result)) {
            for (const slot of slots) {
              inverted[slot] = identity;
            }
          }
          const epochRes = await fetch(heliusRpc, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getEpochInfo", params: [] }),
          });
          const { result: epochInfo } = await epochRes.json() as { result: { epoch: number } };
          const epoch = epochInfo?.epoch ?? 0;
          await connection.set(
            `leader:${epoch}`,
            JSON.stringify(inverted),
            "EX",
            3 * 24 * 60 * 60,
          );
          console.log(`validator-refresh: cached leader schedule for epoch ${epoch}`);
        }
      }
    } catch (err) {
      console.warn("validator-refresh: leader schedule cache failed:", err);
    }

    console.log(`validator-refresh: upserted ${validatorList.length} validators`);
    return { refreshed: validatorList.length };
  },
  { connection, concurrency: 1 },
);

console.log("validator-refresh worker up — consuming queue: validator-refresh");
