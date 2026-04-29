import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { createDb } from "@get-toasted/db";

const REDIS_URL = process.env.REDIS_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

if (!REDIS_URL || !DATABASE_URL || !HELIUS_API_KEY) {
  throw new Error("Missing required env vars: REDIS_URL, DATABASE_URL, HELIUS_API_KEY");
}

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const db = createDb(DATABASE_URL);

/**
 * validator-refresh — cron-triggered job that updates the validators table
 * with current sandwich counts and metadata.
 *
 * Fetches current epoch validators from Helius/RPC, then aggregates
 * sandwich counts from detected_sandwiches grouped by validator_vote.
 */
new Worker(
  "validator-refresh",
  async (job: Job) => {
    // TODO: call Helius getVoteAccounts or Solana RPC getVoteAccounts
    // TODO: for each validator, count detected_sandwiches WHERE validator_vote = vote_account
    // TODO: upsert into validators table
    console.log("validator-refresh job", job.id);
    return { refreshed: 0 };
  },
  { connection, concurrency: 1 },
);

console.log("validator-refresh worker up — consuming queue: validator-refresh");
