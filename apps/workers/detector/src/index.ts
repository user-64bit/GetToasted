import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { serverEnv } from "@get-toasted/env";
import {
  HeliusClient,
  type HeliusEnhancedTransaction,
} from "@get-toasted/helius";
import {
  computeLossUsd,
  detectSandwichesInSlot,
  TRACKED_DEX_PROGRAM_ID_SET,
  type SandwichDetection,
} from "@get-toasted/core";
import { createDb, Sandwiches } from "@get-toasted/db";
import {
  createBlockExpander,
  createBlockTimeResolver,
  createDecimalsResolver,
  createLeaderScheduleCache,
  createLogger,
  createPriceClient,
  redisKeys,
} from "@get-toasted/runtime";

const log = createLogger({ worker: "detector" });

const connection = new IORedis(serverEnv.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});
const helper = new IORedis(serverEnv.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const helius = new HeliusClient(
  serverEnv.HELIUS_API_KEY,
  serverEnv.HELIUS_RPC_URL,
);
const db = createDb(serverEnv.DATABASE_URL);
const leader = createLeaderScheduleCache({ redis: helper, helius });
const prices = createPriceClient({
  redis: helper,
  jupiterApiKey: serverEnv.JUPITER_API_KEY,
});
const rpcUrl =
  serverEnv.HELIUS_RPC_URL ??
  `https://mainnet.helius-rpc.com/?api-key=${serverEnv.HELIUS_API_KEY}`;
const blockTimeResolver = createBlockTimeResolver({ redis: helper, rpcUrl });
const decimals = createDecimalsResolver({ redis: helper, rpcUrl });
const blockExpander = createBlockExpander({ redis: helper, helius, logger: log });

type RealtimeJobData = { transaction: HeliusEnhancedTransaction };

async function publishAlert(wallet: string, payload: Record<string, unknown>): Promise<void> {
  await helper.xadd(
    redisKeys.alertsQueue(wallet),
    "MAXLEN",
    "~",
    "1000",
    "*",
    ...Object.entries(payload).flatMap(([k, v]) => [k, String(v)]),
  );
}

async function enrichDetection(det: SandwichDetection): Promise<Sandwiches.SandwichInsert> {
  const { candidate } = det;

  let blockTime = candidate.front.blockTime;
  if (Number.isNaN(blockTime.getTime()) || blockTime.getTime() === 0) {
    const fetched = await blockTimeResolver.getBlockTime(candidate.slot);
    if (fetched) blockTime = fetched;
  }

  const validatorVote =
    det.validatorVoteAccount ?? (await leader.getValidatorForSlot(candidate.slot));

  const profitDecimals =
    candidate.front.inputDecimals ||
    (await decimals.getDecimals(candidate.front.inputMint)) ||
    0;
  const priceUsd = await prices.getTokenPriceUsd(candidate.front.inputMint, blockTime);
  const lossUsd = computeLossUsd(det.victimLossRaw, profitDecimals, priceUsd);

  return {
    slot: candidate.slot,
    blockTime,
    pool: candidate.pool,
    dex: candidate.front.dex,
    attacker: candidate.front.signer,
    victimWallet: candidate.victim.signer,
    validatorVote,
    frontSig: candidate.front.signature,
    victimSig: candidate.victim.signature,
    backSig: candidate.back.signature,
    jitoBundled: det.jitoBundled,
    jitoTipLamports:
      candidate.front.jitoTipLamports ?? candidate.back.jitoTipLamports ?? null,
    inputMint: candidate.front.inputMint,
    outputMint: candidate.front.outputMint,
    victimInAmt: candidate.victim.inputAmount.toString(),
    victimOutAmt: candidate.victim.outputAmount.toString(),
    counterfactualOutAmt: null,
    attackerProfitRaw: det.attackerProfitRaw.toString(),
    lossUsd: lossUsd !== null ? lossUsd.toFixed(2) : null,
    confidence: det.confidenceScore.toFixed(2),
    failed: det.failed,
    isKnownBot: det.isKnownBot,
    knownBotName: det.knownBotName,
  };
}

function txTouchesTrackedDex(tx: HeliusEnhancedTransaction): boolean {
  for (const ix of tx.instructions ?? []) {
    if (TRACKED_DEX_PROGRAM_ID_SET.has(ix.programId)) return true;
    for (const inner of ix.innerInstructions ?? []) {
      if (TRACKED_DEX_PROGRAM_ID_SET.has(inner.programId)) return true;
    }
  }
  return false;
}

async function processJob(job: Job<RealtimeJobData>): Promise<{ detected: number }> {
  const tx = job.data.transaction;
  if (!tx) return { detected: 0 };
  // Don't filter on `tx.type === "SWAP"` — Helius classifies a meaningful
  // fraction of real swaps as TRANSFER / UNKNOWN. The block expander
  // discovers all swaps in the slot regardless of how the webhook tx was
  // classified, so the only safe pre-filter is "did the protected wallet
  // even touch a tracked DEX in this tx".
  if (!txTouchesTrackedDex(tx)) return { detected: 0 };

  // The webhook fires on a single tx — the protected wallet's swap. That's
  // the *victim* we're checking for. To form a sandwich triple the
  // detector also needs the attacker's front + back txs in the same slot
  // and pool, which only show up when we expand the full block.
  const victimWallet = tx.feePayer;
  const slot = BigInt(tx.slot);

  const allSwaps = await blockExpander.getBlockSwaps(slot);
  if (allSwaps.length < 3) {
    // Block expansion returned too few swaps for any triple to form. Either
    // the slot really has no other swaps, or expansion failed transiently
    // (the expander logs the failure and returns []). Either way, nothing
    // to do — webhook won't refire, but the historical scan would catch
    // this slot if expansion succeeds later.
    return { detected: 0 };
  }

  const detections = detectSandwichesInSlot(allSwaps, null);
  const ours = detections.filter((d) => d.candidate.victim.signer === victimWallet);
  if (ours.length === 0) {
    log.debug(
      {
        signature: tx.signature,
        slot: slot.toString(),
        blockSwaps: allSwaps.length,
        otherDetections: detections.length,
      },
      "detector: slot expanded — no sandwich against this wallet",
    );
    return { detected: 0 };
  }

  const enriched: Sandwiches.SandwichInsert[] = [];
  for (const det of ours) {
    enriched.push(await enrichDetection(det));
  }

  const { inserted } = await Sandwiches.batchInsertDetections(db, enriched);
  for (const row of inserted) {
    await publishAlert(row.victimWallet, {
      type: "sandwich_detected",
      sandwichId: row.id.toString(),
      slot: row.slot.toString(),
      dex: row.dex,
      lossUsd: row.lossUsd ?? "",
      confidence: row.confidence,
      attacker: row.attacker,
    });
  }

  log.info(
    {
      signature: tx.signature,
      slot: slot.toString(),
      detected: inserted.length,
      victimWallet,
    },
    "detector: realtime tx processed",
  );
  return { detected: inserted.length };
}

const worker = new Worker<RealtimeJobData>("scan-realtime", processJob, {
  connection,
  concurrency: 20,
});

worker.on("ready", () => log.info("detector: ready"));
worker.on("failed", (job, err) =>
  log.error({ jobId: job?.id, err }, "detector: job failed"),
);

const shutdown = async (signal: string) => {
  log.info({ signal }, "detector: shutting down");
  await worker.close();
  connection.disconnect();
  helper.disconnect();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

log.info("detector: worker up — queue: scan-realtime");
