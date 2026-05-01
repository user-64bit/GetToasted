import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { serverEnv } from "@get-toasted/env";
import {
  HeliusClient,
  parseHeliusTxToSwaps,
  type HeliusEnhancedTransaction,
} from "@get-toasted/helius";
import {
  computeLossUsd,
  detectSandwichesAcrossSlots,
  type SandwichDetection,
} from "@get-toasted/core";
import { createDb, Sandwiches } from "@get-toasted/db";
import {
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

async function processJob(job: Job<RealtimeJobData>): Promise<{ detected: number }> {
  const tx = job.data.transaction;
  if (!tx || tx.type !== "SWAP") return { detected: 0 };

  const swaps = parseHeliusTxToSwaps(tx);
  if (swaps.length < 3) return { detected: 0 };

  const detections = detectSandwichesAcrossSlots(swaps);
  if (detections.length === 0) return { detected: 0 };

  const enriched: Sandwiches.SandwichInsert[] = [];
  for (const det of detections) {
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
    { signature: tx.signature, detected: inserted.length },
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
