import { Worker, type Job, UnrecoverableError, Queue } from "bullmq";
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
  type ParsedSwap,
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
  createBlockExpander,
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
const blockExpander = createBlockExpander({ redis: helper, helius, logger: log });

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
const MAX_SCAN_SIGNATURES = serverEnv.MAX_SCAN_SIGNATURES;
const MAX_SCAN_SLOTS = serverEnv.MAX_SCAN_SLOTS;

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

/**
 * Discover candidate slots from a batch of the wallet's enhanced txs.
 *
 * We include a slot only if at least one of the wallet's txs in that slot
 * has an outer or inner instruction touching a tracked DEX program. This
 * is cheaper and more accurate than relying on Helius's `type` field,
 * which misclassifies many real swaps. Skipping non-DEX slots keeps the
 * block-expansion fan-out bounded for wallets with heavy non-swap
 * activity (transfers, votes, NFT mints, etc.).
 */
function slotsTouchingTrackedDex(txs: HeliusEnhancedTransaction[]): bigint[] {
  const seen = new Set<string>();
  const out: bigint[] = [];
  for (const tx of txs) {
    if (!walletTxTouchesTrackedDex(tx)) continue;
    const k = String(tx.slot);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(BigInt(tx.slot));
  }
  return out;
}

function walletTxTouchesTrackedDex(tx: HeliusEnhancedTransaction): boolean {
  for (const ix of tx.instructions ?? []) {
    if (TRACKED_DEX_PROGRAM_ID_SET.has(ix.programId)) return true;
    for (const inner of ix.innerInstructions ?? []) {
      if (TRACKED_DEX_PROGRAM_ID_SET.has(inner.programId)) return true;
    }
  }
  return false;
}

function runDetectionPerSlot(swaps: ParsedSwap[]): SandwichDetection[] {
  // Group swaps by slot manually — `detectSandwichesAcrossSlots` exists for
  // this but takes a synchronous validatorBySlot resolver, and we resolve
  // validators downstream in enrichDetection (where we already pay the
  // cache lookup cost). Calling per-slot keeps the detection input set
  // small and lets us log slot-level stats if we ever need to debug.
  const bySlot = new Map<string, ParsedSwap[]>();
  for (const s of swaps) {
    const k = s.slot.toString();
    const bucket = bySlot.get(k);
    if (bucket) bucket.push(s);
    else bySlot.set(k, [s]);
  }
  const out: SandwichDetection[] = [];
  for (const slotSwaps of bySlot.values()) {
    out.push(...detectSandwichesInSlot(slotSwaps, null));
  }
  return out;
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
    let slotsExpandedTotal = 0;
    let stopReason: "exhausted" | "max_signatures" | "max_slots" | "budget" = "exhausted";
    const startedAt = Date.now();

    while (true) {
      if (Date.now() - startedAt > SOFT_BUDGET_MS) {
        jobLog.info({ cursor, signaturesProcessed }, "soft budget hit — requeueing");
        await scanQueue.add(
          "scan",
          { wallet, jobId, resumeCursor: cursor },
          { jobId: `${jobId}:resume:${signaturesProcessed}` },
        );
        stopReason = "budget";
        return;
      }

      // Hard caps to bound Helius credit consumption per scan. Helius
      // returns reverse-chronological, so hitting either cap means the
      // *recent* coverage is complete and only older history is truncated.
      if (signaturesProcessed >= MAX_SCAN_SIGNATURES) {
        jobLog.info(
          { signaturesProcessed, cap: MAX_SCAN_SIGNATURES },
          "scanner: signature cap reached — stopping scan",
        );
        stopReason = "max_signatures";
        break;
      }
      if (slotsExpandedTotal >= MAX_SCAN_SLOTS) {
        jobLog.info(
          { slotsExpandedTotal, cap: MAX_SCAN_SLOTS },
          "scanner: slot cap reached — stopping scan",
        );
        stopReason = "max_slots";
        break;
      }

      // Tighten the page request to whatever's left under the signature
      // cap, so we don't fetch a final batch of 100 that we can't fully
      // process. Helius caps `limit` at 100 anyway.
      const remainingSignatures = MAX_SCAN_SIGNATURES - signaturesProcessed;
      const pageLimit = Math.min(BATCH_LIMIT, remainingSignatures);

      // We *don't* pass type=SWAP here. Helius classifies a substantial
      // fraction of real swaps as TRANSFER / UNKNOWN — for some wallets
      // the SWAP filter returns only a tiny window of recent txs, hiding
      // older sandwiches entirely (e.g. a wallet with 100s of swaps may
      // surface only 21 SWAP-classified ones). Instead we fetch all txs
      // and discover candidate slots by inspecting instruction program ids,
      // which is authoritative — if a tx didn't touch a tracked DEX, it
      // can't have been part of a sandwich on this wallet.
      const txs = await helius.getTransactionsForAddress({
        address: wallet,
        limit: pageLimit,
        before: cursor,
      });

      if (txs.length === 0) break;

      // Cap the slots we expand from this batch so we never overshoot
      // MAX_SCAN_SLOTS in a single block-expansion call.
      const fullCandidateSlots = slotsTouchingTrackedDex(txs);
      const slotBudget = MAX_SCAN_SLOTS - slotsExpandedTotal;
      const candidateSlots = fullCandidateSlots.slice(0, slotBudget);

      let inserted = 0;
      if (candidateSlots.length > 0) {
        // Block expansion fetches every swap in each slot (caching per-slot
        // in Redis), so the detector sees the full attacker front + victim
        // + back triple. We then filter detections to those where THIS
        // wallet is the victim; sandwiches against other victims surfaced
        // during expansion belong to a different wallet's scan.
        const allSwaps = await blockExpander.getSwapsForSlots(candidateSlots);
        const detections = runDetectionPerSlot(allSwaps);
        const ours = detections.filter((d) => d.candidate.victim.signer === wallet);

        if (ours.length > 0) {
          const enriched: SandwichInsert[] = [];
          for (const det of ours) {
            enriched.push(await enrichDetection(det));
          }
          const result = await Sandwiches.batchInsertDetections(db, enriched);
          inserted = result.inserted.length;
        }

        jobLog.debug(
          {
            txsFetched: txs.length,
            slotsExpanded: candidateSlots.length,
            blockSwapsTotal: allSwaps.length,
            detectionsFound: detections.length,
            detectionsForThisWallet: ours.length,
            insertedCount: inserted,
          },
          "scanner: batch detection complete",
        );
      }

      signaturesProcessed += txs.length;
      sandwichesFound += inserted;
      slotsExpandedTotal += candidateSlots.length;

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
      {
        signaturesProcessed,
        sandwichesFound,
        slotsExpandedTotal,
        stopReason,
        durationMs: Date.now() - startedAt,
      },
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
