import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { detectSandwichesAcrossSlots, type ParsedSwap } from "@get-toasted/core";
import { createDb, detectedSandwiches } from "@get-toasted/db";

const REDIS_URL = process.env.REDIS_URL;
const DATABASE_URL = process.env.DATABASE_URL;

if (!REDIS_URL || !DATABASE_URL) {
  throw new Error("Missing required env vars: REDIS_URL, DATABASE_URL");
}

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const db = createDb(DATABASE_URL);

/**
 * scan-realtime — triggered by Helius webhook for each new confirmed block.
 * Job data: { slot: number; swaps: ParsedSwap[] }
 *
 * This worker receives pre-parsed swaps from the webhook handler
 * (the api app enqueues them after parsing the Helius enhanced transaction payload).
 */
new Worker(
  "scan-realtime",
  async (job: Job<{ slot: number; swaps: ParsedSwap[] }>) => {
    const { slot, swaps } = job.data;

    if (swaps.length < 3) {
      return { slot, detected: 0 };
    }

    const sandwiches = detectSandwichesAcrossSlots(swaps);

    if (sandwiches.length > 0) {
      await db
        .insert(detectedSandwiches)
        .values(
          sandwiches.map((s) => ({
            slot: BigInt(s.slot),
            blockTime: new Date(), // TODO: get from slot timestamp
            pool: s.pool,
            dex: s.front.programId.slice(0, 16),
            attacker: s.attacker,
            victimWallet: s.victim,
            validatorVote: "", // TODO: leader-schedule cache
            frontSig: s.front.signature,
            victimSig: s.victimSwap.signature,
            backSig: s.back.signature,
            jitoBundled: s.jitoBundled,
            inputMint: s.front.inputMint,
            outputMint: s.front.outputMint,
            victimInAmt: s.victimSwap.inputAmount.toString(),
            victimOutAmt: s.victimSwap.outputAmount.toString(),
          })),
        )
        .onConflictDoNothing();
    }

    return { slot, detected: sandwiches.length };
  },
  { connection, concurrency: 10 },
);

console.log("detector worker up — consuming queue: scan-realtime");
