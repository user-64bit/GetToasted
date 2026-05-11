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

// Hard scan time cap — when hit, we break out of the scan loop and
// complete with whatever was found so far. No requeue. Keeps Helius
// credit usage bounded.
//
// Default 60s covers a typical wallet's recent activity (~150-300
// slots with anchor-window expansion + 5-way concurrency). Override
// via MAX_SCAN_DURATION_MS env var for backfill scans.
const MAX_SCAN_DURATION_MS = serverEnv.MAX_SCAN_DURATION_MS;
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
 * Discover candidate slots + the wallet's sig anchors per slot.
 *
 * A slot enters the candidate set only if at least one of the wallet's
 * txs in that slot has an outer or inner instruction touching a
 * tracked DEX program. The anchors are the wallet's signatures in
 * those slots — passed to the block expander as narrow-window anchors
 * so we only parse swaps near the wallet's tx, not the entire block.
 *
 * A wallet may have multiple txs in the same slot (e.g., a Jupiter
 * route landing in the same slot as another swap). Collecting all of
 * them means the narrow window covers each, with the block expander
 * unioning the per-anchor windows.
 */
function discoverScanCandidates(
  txs: HeliusEnhancedTransaction[],
): { slots: bigint[]; anchorsBySlot: Map<string, string[]> } {
  const seenSlots = new Set<string>();
  const slots: bigint[] = [];
  const anchorsBySlot = new Map<string, string[]>();
  for (const tx of txs) {
    if (!walletTxTouchesTrackedDex(tx)) continue;
    const slotKey = String(tx.slot);
    if (!seenSlots.has(slotKey)) {
      seenSlots.add(slotKey);
      slots.push(BigInt(tx.slot));
    }
    const anchors = anchorsBySlot.get(slotKey) ?? [];
    anchors.push(tx.signature);
    anchorsBySlot.set(slotKey, anchors);
  }
  return { slots, anchorsBySlot };
}

function walletTxTouchesTrackedDex(tx: HeliusEnhancedTransaction): boolean {
  // Primary: outer and inner instructions from the instruction list.
  for (const ix of tx.instructions ?? []) {
    if (TRACKED_DEX_PROGRAM_ID_SET.has(ix.programId)) return true;
    for (const inner of ix.innerInstructions ?? []) {
      if (TRACKED_DEX_PROGRAM_ID_SET.has(inner.programId)) return true;
    }
  }
  // Secondary: events.swap.innerSwaps populated by Helius for Jupiter routes.
  // The outer instruction is the Jupiter aggregator (untracked), so the
  // instruction scan above returns false even though the route hits a
  // tracked DEX sub-program. events.swap is always present for Jupiter swaps.
  for (const leg of tx.events?.swap?.innerSwaps ?? []) {
    if (TRACKED_DEX_PROGRAM_ID_SET.has(leg.programInfo?.account ?? "")) return true;
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
  diagBudget: { remaining: number },
  jobLog: typeof log,
): Promise<SandwichDetection[]> {
  const walletSwaps = blockSwaps.filter((s) => s.signer === wallet);
  if (walletSwaps.length === 0) return [];
  const detections = await detectSandwichesForWalletSwaps({
    wallet,
    walletSwaps,
    blockSwaps,
    jito,
  });

  // Diagnostic: when the wallet had a swap in this slot but no
  // detection fired, log the same-pool block context so an operator
  // can see why. Most common diagnosis from this output:
  //   - "no other same-pool swaps in slot" → bot used an untracked DEX,
  //     or its tx didn't make it into the block-expander (parse miss)
  //   - "candidates present but no shape match" → check input/output
  //     mints and signers; if pool keys diverge between victim and bot
  //     that's a pool-resolution bug
  // Capped per-scan to avoid flooding the log on busy DEX wallets.
  if (detections.length === 0 && diagBudget.remaining > 0) {
    for (const v of walletSwaps) {
      if (diagBudget.remaining <= 0) break;
      const sameSlot = blockSwaps.filter(
        (s) => s.slot === v.slot && s.signature !== v.signature,
      );
      const samePool = sameSlot.filter((s) => s.pool === v.pool);
      jobLog.debug(
        {
          slot: v.slot.toString(),
          victimSig: v.signature,
          victimPool: v.pool,
          victimDex: v.dex,
          victimTxIndex: v.txIndexInBlock,
          victimDirection: `${v.inputMint.slice(0, 4)}→${v.outputMint.slice(0, 4)}`,
          sameSlotSwaps: sameSlot.length,
          samePoolSwaps: samePool.length,
          samePoolDigest: samePool.slice(0, 6).map((s) => ({
            sig: s.signature.slice(0, 8),
            signer: s.signer.slice(0, 8),
            idx: s.txIndexInBlock,
            dir: `${s.inputMint.slice(0, 4)}→${s.outputMint.slice(0, 4)}`,
            failed: s.failed,
          })),
        },
        "scanner: wallet swap in slot but no L1/L2 detection — diagnostic dump",
      );
      diagBudget.remaining -= 1;
    }
  }

  return detections;
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
    // Cap how many "wallet swap with no detection" diagnostic dumps we
    // emit per scan job. Heavy DEX wallets can have hundreds of slots
    // with no sandwich; we don't want to flood the log.
    const diagBudget = { remaining: 5 };

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

      const { slots: fullCandidateSlots, anchorsBySlot } =
        discoverScanCandidates(txs);
      const slotBudget = MAX_SCAN_SLOTS - slotsExpandedTotal;
      const candidateSlots = fullCandidateSlots.slice(0, slotBudget);

      let inserted = 0;
      if (candidateSlots.length > 0) {
        // Anchor-windowed block expansion: for each slot, only parse
        // swaps within ±10 block positions of the wallet's own txs in
        // that slot. Tight sandwiches always have the bot's legs
        // immediately adjacent, so this drops per-slot parse work
        // from ~100 candidates (busy mainnet block) to ~5-10 — a 10x
        // latency + Helius credit win without any detection-coverage
        // loss for L1+L2.
        //
        // Concurrency 5: Helius's token bucket (50 RPS sustained) and
        // typical per-slot wall time (~500ms post-narrowing) mean we
        // can fan out 5 slots in parallel without throttling.
        const allSwaps = await blockExpander.getSwapsForSlots(candidateSlots, {
          deadline,
          anchorSigsBySlot: anchorsBySlot,
        });
        const detections = await runLayeredDetection(wallet, allSwaps, diagBudget, jobLog);

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
process.on("unhandledRejection", (reason) => {
  log.error({ err: reason }, "scanner: unhandledRejection");
});
process.on("uncaughtException", (err) => {
  log.error({ err }, "scanner: uncaughtException");
});

log.info("scanner: worker up — queue: scan-historical");
