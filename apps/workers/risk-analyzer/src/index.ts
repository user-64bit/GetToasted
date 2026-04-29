import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { createDb } from "@get-toasted/db";

const REDIS_URL = process.env.REDIS_URL;
const DATABASE_URL = process.env.DATABASE_URL;

if (!REDIS_URL || !DATABASE_URL) {
  throw new Error("Missing required env vars: REDIS_URL, DATABASE_URL");
}

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const db = createDb(DATABASE_URL);

/**
 * risk-score — cron-triggered job that calculates USD loss estimates
 * for newly detected sandwiches that are missing lossUsd.
 *
 * Job data: { sandwichId: bigint } — or run as a sweep with no data.
 */
new Worker(
  "risk-score",
  async (job: Job<{ sandwichId?: string }>) => {
    // TODO: query detected_sandwiches WHERE loss_usd IS NULL LIMIT 100
    // TODO: for each, call @get-toasted/jupiter getQuote at victimInAmt
    // TODO: compare counterfactual outAmount vs victimOutAmt → lossUsd
    // TODO: update detected_sandwiches SET loss_usd = ..., counterfactual_out_amt = ...
    console.log("risk-score job", job.id);
    return { processed: 0 };
  },
  { connection, concurrency: 2 },
);

console.log("risk-analyzer worker up — consuming queue: risk-score");
