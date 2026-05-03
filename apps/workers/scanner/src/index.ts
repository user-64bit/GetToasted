import { Worker, type Job, UnrecoverableError, Queue } from "bullmq";
import IORedis from "ioredis";
import { serverEnv } from "@get-toasted/env";
import {
  HeliusClient,
  type HeliusEnhancedTransaction,
} from "@get-toasted/helius";
import {
  detectSandwichesForWalletSwaps,
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
import {
  createBlockExpander,
  createBlockTimeResolver,
  createDecimalsResolver,
  createJitoBundleClient,
  createLeaderScheduleCache,
  createLogger,
  createPriceClient,
  createWebhookManager,
  enrichSandwichDetection,
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
const jito = createJitoBundleClient({ redis: helper, logger: log });

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

// Hard 30s cap — when hit, we break out of the scan loop and complete
// with whatever was found so far. No requeue. Keeps Helius credit usage
// bounded while we iterate on the rest of the pipeline.
const MAX_SCAN_DURATION_MS = 30_000;
const BATCH_LIMIT = 100;
const MAX_SCAN_SIGNATURES = serverEnv.MAX_SCAN_SIGNATURES;
const MAX_SCAN_SLOTS = serverEnv.MAX_SCAN_SLOTS;

async function enrichDetection(
  det: SandwichDetection,
): Promise<Sandwiches.SandwichInsert> {
  return enrichSandwichDetection(det, {
    leader,
    prices,
    decimals,
    blockTime: blockTimeResolver,
  });
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

/**
 * Run the layered detector against every wallet swap in the expanded
 * block set. The wallet's swaps are the *victim candidates*; the rest
 * of the block-expanded swaps are the same-block context that L1/L2
 * compare against.
 */
async function runLayeredDetection(
  wallet: string,
  blockSwaps: ParsedSwap[],
): Promise<SandwichDetection[]> {
  const walletSwaps = blockSwaps.filter((s) => s.signer === wallet);
  if (walletSwaps.length === 0) return [];
  return detectSandwichesForWalletSwaps({
    wallet,
    walletSwaps,
    blockSwaps,
    jito,
  });
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
    const deadline = startedAt + MAX_SCAN_DURATION_MS;

    while (true) {
      if (Date.now() - startedAt > MAX_SCAN_DURATION_MS) {
        jobLog.info(
          { cursor, signaturesProcessed, sandwichesFound, durationMs: MAX_SCAN_DURATION_MS },
          "scanner: time budget hit — completing with partial results",
        );
        stopReason = "budget";
        break;
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
      // older sandwiches entirely. Instead we fetch all txs and discover
      // candidate slots by inspecting instruction program ids.
      const txs = await helius.getTransactionsForAddress({
        address: wallet,
        limit: pageLimit,
        before: cursor,
      });

      if (txs.length === 0) break;

      const fullCandidateSlots = slotsTouchingTrackedDex(txs);
      const slotBudget = MAX_SCAN_SLOTS - slotsExpandedTotal;
      const candidateSlots = fullCandidateSlots.slice(0, slotBudget);

      let inserted = 0;
      if (candidateSlots.length > 0) {
        // Block expansion fetches every swap in each slot (caching per-slot
        // in Redis), so the layered detector sees the full attacker front +
        // victim + back triple plus pool reserves for CPMM loss math.
        const allSwaps = await blockExpander.getSwapsForSlots(candidateSlots, { deadline });
        const detections = await runLayeredDetection(wallet, allSwaps);

        if (detections.length > 0) {
          const enriched: Sandwiches.SandwichInsert[] = [];
          for (const det of detections) {
            // Bail out of enrichment too if we've blown past the deadline —
            // each enrichDetection makes RPC + price calls.
            if (Date.now() > deadline) break;
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
            detectionsForThisWallet: detections.length,
            insertedCount: inserted,
            byLayer: detections.reduce<Record<string, number>>((acc, d) => {
              acc[d.layer] = (acc[d.layer] ?? 0) + 1;
              return acc;
            }, {}),
          },
          "scanner: batch detection complete",
        );
      }

      signaturesProcessed += txs.length;
      sandwichesFound += inserted;
      slotsExpandedTotal += candidateSlots.length;

      const lastSig = txs[txs.length - 1]?.signature;
      cursor = lastSig;

      // Cap at 95% — completeScanJob writes the final 100. Both caps (sigs
      // and slots) move the bar; whichever is closer to its limit wins.
      // Round to int because progress_pct is a smallint column.
      const sigPct = (signaturesProcessed / MAX_SCAN_SIGNATURES) * 100;
      const slotPct = (slotsExpandedTotal / MAX_SCAN_SLOTS) * 100;
      const progressPct = Math.min(95, Math.round(Math.max(sigPct, slotPct)));

      await ScanJobsQ.bumpScanJobProgress(
        db,
        jobId,
        { signatures: txs.length, sandwiches: inserted, progressPct },
        cursor ?? null,
      );
      await helper.set(
        redisKeys.scanProgress(wallet),
        JSON.stringify({ signaturesProcessed, sandwichesFound, cursor, progressPct }),
        "EX",
        60 * 60,
      );
      await job.updateProgress(progressPct);

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

log.info("scanner: worker up — queue: scan-historical");
