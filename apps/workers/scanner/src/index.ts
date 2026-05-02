import { Worker, type Job, UnrecoverableError, Queue } from "bullmq";
import IORedis from "ioredis";
import { serverEnv } from "@get-toasted/env";
import { HeliusClient, parseHeliusBatchToSwaps } from "@get-toasted/helius";
import {
  computeLossUsd,
  detectSandwichesAcrossSlots,
  type SandwichDetection,
} from "@get-toasted/core";
import {
  createDb,
  Sandwiches,
  ScanJobsQ,
  Wallets,
} from "@get-toasted/db";

type SandwichInsert = Sandwiches.SandwichInsert;
import {
  createBlockTimeResolver,
  createDecimalsResolver,
  createLeaderScheduleCache,
  createLogger,
  createPriceClient,
  createWebhookManager,
  redisKeys,
  SCAN_LOCK_TTL_SECONDS,
} from "@get-toasted/runtime";

const log = createLogger({ worker: "scanner" });

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
const blockTimeResolver = createBlockTimeResolver({
  redis: helper,
  rpcUrl: serverEnv.HELIUS_RPC_URL ?? `https://mainnet.helius-rpc.com/?api-key=${serverEnv.HELIUS_API_KEY}`,
});
const decimals = createDecimalsResolver({
  redis: helper,
  rpcUrl: serverEnv.HELIUS_RPC_URL ?? `https://mainnet.helius-rpc.com/?api-key=${serverEnv.HELIUS_API_KEY}`,
});

const webhooks = createWebhookManager({
  helius,
  redis: helper,
  db,
  apiBaseUrl: serverEnv.API_BASE_URL ?? serverEnv.APP_URL,
  webhookSecret: serverEnv.HELIUS_WEBHOOK_SECRET,
  webhookId: serverEnv.HELIUS_WEBHOOK_ID,
});

const scanQueue = new Queue("scan-historical", { connection });

type ScanJobData = {
  wallet: string;
  jobId: string;
  resumeCursor?: string;
};

const SOFT_BUDGET_MS = 9 * 60 * 1000;
const BATCH_LIMIT = 100;

async function enrichDetection(det: SandwichDetection): Promise<SandwichInsert> {
  const { candidate } = det;
  const validatorVote =
    det.validatorVoteAccount ?? (await leader.getValidatorForSlot(candidate.slot));

  const inputDecimals =
    candidate.front.inputDecimals ||
    (await decimals.getDecimals(candidate.front.inputMint)) ||
    0;
  const outputDecimals =
    candidate.front.outputDecimals ||
    (await decimals.getDecimals(candidate.front.outputMint)) ||
    0;

  const profitMint = candidate.front.inputMint;
  const profitDecimals = inputDecimals;
  const priceUsd = await prices.getTokenPriceUsd(profitMint, candidate.front.blockTime);
  const lossUsd = computeLossUsd(det.victimLossRaw, profitDecimals, priceUsd);

  return {
    slot: candidate.slot,
    blockTime: candidate.front.blockTime,
    pool: candidate.pool,
    dex: candidate.front.dex,
    attacker: candidate.front.signer,
    victimWallet: candidate.victim.signer,
    validatorVote,
    frontSig: candidate.front.signature,
    victimSig: candidate.victim.signature,
    backSig: candidate.back.signature,
    jitoBundled: det.jitoBundled,
    jitoTipLamports: candidate.front.jitoTipLamports ?? candidate.back.jitoTipLamports ?? null,
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

async function processJob(job: Job<ScanJobData>): Promise<void> {
  const { wallet, jobId } = job.data;
  const jobLog = log.child({ wallet, jobId, bullJobId: job.id });

  const lockKey = redisKeys.scanLock(wallet);
  const acquired = await helper.set(lockKey, jobId, "EX", SCAN_LOCK_TTL_SECONDS, "NX");
  if (!acquired) {
    const owner = await helper.get(lockKey);
    if (owner !== jobId) {
      jobLog.warn({ owner }, "scan lock held by another job — skipping");
      return;
    }
  }

  try {
    await ScanJobsQ.startScanJob(db, jobId);
    await Wallets.setWalletScanStatus(db, wallet, { scanStatus: "scanning" });

    let cursor: string | undefined = job.data.resumeCursor;
    let signaturesProcessed = 0;
    let sandwichesFound = 0;
    const startedAt = Date.now();

    while (true) {
      if (Date.now() - startedAt > SOFT_BUDGET_MS) {
        jobLog.info({ cursor, signaturesProcessed }, "soft budget hit — requeueing");
        await scanQueue.add(
          "scan",
          { wallet, jobId, resumeCursor: cursor },
          { jobId: `${jobId}:resume:${signaturesProcessed}` },
        );
        return;
      }

      const txs = await helius.getTransactionsForAddress({
        address: wallet,
        limit: BATCH_LIMIT,
        before: cursor,
        type: "SWAP",
      });

      if (txs.length === 0) break;

      const swaps = parseHeliusBatchToSwaps(txs);
      const detections = swaps.length > 0
        ? detectSandwichesAcrossSlots(swaps)
        : [];

      let inserted = 0;
      if (detections.length > 0) {
        const enriched: SandwichInsert[] = [];
        for (const det of detections) {
          enriched.push(await enrichDetection(det));
        }
        const result = await Sandwiches.batchInsertDetections(db, enriched);
        inserted = result.inserted.length;
      }

      signaturesProcessed += txs.length;
      sandwichesFound += inserted;

      const lastSig = txs[txs.length - 1]?.signature;
      cursor = lastSig;

      await ScanJobsQ.bumpScanJobProgress(
        db,
        jobId,
        { signatures: txs.length, sandwiches: inserted },
        cursor ?? null,
      );
      await helper.set(
        redisKeys.scanProgress(wallet),
        JSON.stringify({ signaturesProcessed, sandwichesFound, cursor }),
        "EX",
        60 * 60,
      );
      await job.updateProgress(Math.min(95, signaturesProcessed % 100));

      jobLog.debug(
        { signaturesProcessed, sandwichesFound, batchSize: txs.length },
        "scanner: batch processed",
      );

      if (txs.length < BATCH_LIMIT) break;
    }

    await ScanJobsQ.completeScanJob(db, jobId);
    await Wallets.setWalletScanStatus(db, wallet, {
      scanStatus: "complete",
      lastScanAt: new Date(),
      lastSignature: cursor ?? null,
      totalTxCount: signaturesProcessed,
    });

    try {
      await webhooks.registerWallet(wallet);
    } catch (err) {
      jobLog.warn({ err }, "scanner: webhook registration failed (non-fatal)");
    }

    jobLog.info(
      { signaturesProcessed, sandwichesFound, durationMs: Date.now() - startedAt },
      "scanner: scan complete",
    );
  } catch (err) {
    jobLog.error({ err }, "scanner: job failed");
    if (err instanceof Error && /invalid solana address/i.test(err.message)) {
      await ScanJobsQ.failScanJob(db, jobId, err.message);
      await Wallets.setWalletScanStatus(db, wallet, { scanStatus: "failed" });
      throw new UnrecoverableError(err.message);
    }
    await ScanJobsQ.failScanJob(db, jobId, err instanceof Error ? err.message : String(err));
    await Wallets.setWalletScanStatus(db, wallet, { scanStatus: "failed" });
    throw err;
  } finally {
    const owner = await helper.get(lockKey);
    if (owner === jobId) await helper.del(lockKey);
  }
}

const worker = new Worker<ScanJobData>(
  "scan-historical",
  processJob,
  {
    connection,
    concurrency: 5,
    limiter: { max: 50, duration: 1000 },
  },
);

worker.on("ready", () => log.info("scanner: ready"));
worker.on("failed", (job, err) =>
  log.error({ jobId: job?.id, err }, "scanner: job failed (worker event)"),
);

const shutdown = async (signal: string) => {
  log.info({ signal }, "scanner: shutting down");
  await worker.close();
  await scanQueue.close();
  connection.disconnect();
  helper.disconnect();
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

// Touch unused-but-needed for type completeness
void blockTimeResolver;

log.info("scanner: worker up — queue: scan-historical");
