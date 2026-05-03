import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { serverEnv } from "@get-toasted/env";
import {
  HeliusClient,
  type HeliusEnhancedTransaction,
} from "@get-toasted/helius";
import {
  detectSandwichesForWalletSwaps,
  TRACKED_DEX_PROGRAM_ID_SET,
  type SandwichDetection,
} from "@get-toasted/core";
import { createDb, Sandwiches } from "@get-toasted/db";
import {
  createBlockExpander,
  createBlockTimeResolver,
  createDecimalsResolver,
  createJitoBundleClient,
  createLeaderScheduleCache,
  createLogger,
  createPriceClient,
  enrichSandwichDetection,
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
const jito = createJitoBundleClient({ redis: helper, logger: log });

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
  // classified.
  if (!txTouchesTrackedDex(tx)) return { detected: 0 };

  // The webhook fires on a single tx — the protected wallet's swap. That's
  // the *victim* we're checking for. The layered detector also needs the
  // attacker's front + back txs in the same slot, which only show up
  // when we expand the full block.
  const victimWallet = tx.feePayer;
  const slot = BigInt(tx.slot);

  const allSwaps = await blockExpander.getBlockSwaps(slot);
  if (allSwaps.length < 3) {
    // Not enough swaps in the slot for any sandwich triple. Block
    // expansion may also have failed transiently — historical scanner
    // catches it later.
    return { detected: 0 };
  }

  const detections = await detectSandwichesForWalletSwaps({
    wallet: victimWallet,
    walletSwaps: allSwaps.filter((s) => s.signer === victimWallet),
    blockSwaps: allSwaps,
    jito,
  });

  if (detections.length === 0) {
    log.debug(
      {
        signature: tx.signature,
        slot: slot.toString(),
        blockSwaps: allSwaps.length,
      },
      "detector: slot expanded — no sandwich against this wallet",
    );
    return { detected: 0 };
  }

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
      detectionLayer: row.detectionLayer,
    });
  }

  log.info(
    {
      signature: tx.signature,
      slot: slot.toString(),
      detected: inserted.length,
      victimWallet,
      byLayer: detections.reduce<Record<string, number>>((acc, d) => {
        acc[d.layer] = (acc[d.layer] ?? 0) + 1;
        return acc;
      }, {}),
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
