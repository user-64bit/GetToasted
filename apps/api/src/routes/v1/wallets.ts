import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { SolanaAddressSchema } from "@get-toasted/schemas";
import { Sandwiches, ScanJobsQ, Wallets } from "@get-toasted/db";
import { Queue } from "bullmq";
import { z } from "zod";
import { redisKeys } from "@get-toasted/runtime";
import { db, redis } from "../../lib/connections.js";
// SIWS auth (`../../middleware/auth.ts`) intentionally not imported in
// v1; re-add when the SIWS demo gate is enabled in v2.

const scanQueue = new Queue("scan-historical", { connection: redis });

const AddressParam = z.object({ address: SolanaAddressSchema });

const SandwichesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  dex: z.string().optional(),
  minLossUsd: z.coerce.number().nonnegative().optional(),
});

export const wallets = new Hono();

function decodeCursor(raw?: string): { id: bigint; blockTime: Date } | undefined {
  if (!raw) return undefined;
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as { id: string; blockTime: string };
    return { id: BigInt(parsed.id), blockTime: new Date(parsed.blockTime) };
  } catch {
    return undefined;
  }
}

function encodeCursor(c: { id: string; blockTime: string } | null): string | null {
  if (!c) return null;
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

wallets.get("/:address", zValidator("param", AddressParam), async (c) => {
  const { address } = c.req.valid("param");

  const wallet = await Wallets.getWallet(db, address);
  if (!wallet) {
    return c.json({
      address,
      scanStatus: "unknown",
      sandwichCount: 0,
      totalLossUsd: "0",
      firstAttackAt: null,
      lastAttackAt: null,
      scanProgress: null,
      scanError: null,
    });
  }

  let scanProgress: {
    signaturesProcessed: number;
    sandwichesFound: number;
    cursor: string | null;
    progressPct: number;
  } | null = null;
  let scanError: string | null = null;

  if (wallet.scanStatus === "scanning" || wallet.scanStatus === "pending") {
    const liveRaw = await redis.get(redisKeys.scanProgress(address));
    const job = await ScanJobsQ.getLatestScanJobForWallet(db, address);
    if (liveRaw) {
      try {
        const live = JSON.parse(liveRaw) as {
          signaturesProcessed: number;
          sandwichesFound: number;
          cursor?: string;
          progressPct?: number;
        };
        scanProgress = {
          signaturesProcessed: live.signaturesProcessed,
          sandwichesFound: live.sandwichesFound,
          cursor: live.cursor ?? null,
          progressPct: live.progressPct ?? job?.progressPct ?? 0,
        };
      } catch {
        scanProgress = null;
      }
    } else if (job) {
      scanProgress = {
        signaturesProcessed: job.signaturesProcessed,
        sandwichesFound: job.sandwichesFound,
        cursor: job.cursor,
        progressPct: job.progressPct,
      };
    }
  } else if (wallet.scanStatus === "failed") {
    // Surface the worker's failure reason so the dashboard can show "scan
    // failed: <reason>" instead of silently rendering a clean wallet.
    const job = await ScanJobsQ.getLatestScanJobForWallet(db, address);
    scanError = job?.error ?? "Unknown scan failure";
  }

  return c.json({
    address: wallet.address,
    firstSeenAt: wallet.firstSeenAt,
    lastScanAt: wallet.lastScanAt,
    scanStatus: wallet.scanStatus,
    totalTxCount: wallet.totalTxCount,
    sandwichCount: wallet.sandwichCount,
    totalLossUsd: wallet.totalLossUsd,
    firstAttackAt: wallet.firstAttackAt,
    lastAttackAt: wallet.lastAttackAt,
    scanProgress,
    scanError,
  });
});

wallets.get(
  "/:address/sandwiches",
  zValidator("param", AddressParam),
  zValidator("query", SandwichesQuery),
  async (c) => {
    const { address } = c.req.valid("param");
    const q = c.req.valid("query");

    const { data, nextCursor } = await Sandwiches.getSandwichesForWallet(
      db,
      {
        victimWallet: address,
        fromDate: q.fromDate ? new Date(q.fromDate) : undefined,
        toDate: q.toDate ? new Date(q.toDate) : undefined,
        dex: q.dex,
        minLossUsd: q.minLossUsd,
      },
      {
        limit: q.limit,
        cursor: decodeCursor(q.cursor),
      },
    );

    return c.json({
      data: data.map(serializeSandwich),
      nextCursor: encodeCursor(nextCursor),
    });
  },
);

// NOTE: SIWS authMiddleware intentionally omitted for v1 demo. Per
// SUBMISSION_NOTES.md "scope intentionally excluded", paste-wallet
// is the demo flow and SIWS is deferred to v2. Re-add `authMiddleware`
// to gate scans behind a signed-in session.
wallets.post(
  "/:address/scan",
  zValidator("param", AddressParam),
  async (c) => {
    const { address } = c.req.valid("param");

    const lockHolder = await redis.get(redisKeys.scanLock(address));
    if (lockHolder) {
      return c.json({ error: "scan_already_running", code: "SCAN_LOCK_HELD" }, 409);
    }

    await Wallets.upsertWalletPending(db, address);
    const job = await ScanJobsQ.createScanJob(db, address);

    await scanQueue.add(
      "scan",
      { wallet: address, jobId: job.id },
      { jobId: job.id, removeOnComplete: { age: 24 * 60 * 60 } },
    );

    return c.json(
      {
        scanId: job.id,
        status: "queued",
        estimatedDurationSeconds: 300,
      },
      202,
    );
  },
);

declare module "hono" {
  interface ContextVariableMap {
    wallet: string;
  }
}

function serializeSandwich(row: Sandwiches.SandwichRow) {
  return {
    id: row.id.toString(),
    slot: row.slot.toString(),
    blockTime: row.blockTime,
    pool: row.pool,
    dex: row.dex,
    attacker: row.attacker,
    victimWallet: row.victimWallet,
    validatorVote: row.validatorVote,
    frontSig: row.frontSig,
    victimSig: row.victimSig,
    backSig: row.backSig,
    jitoBundled: row.jitoBundled,
    jitoTipLamports: row.jitoTipLamports?.toString() ?? null,
    inputMint: row.inputMint,
    outputMint: row.outputMint,
    victimInAmt: row.victimInAmt,
    victimOutAmt: row.victimOutAmt,
    attackerProfitRaw: row.attackerProfitRaw,
    lossUsd: row.lossUsd,
    confidence: row.confidence,
    failed: row.failed,
    isKnownBot: row.isKnownBot,
    knownBotName: row.knownBotName,
    detectionLayer: row.detectionLayer,
    lossMethod: row.lossMethod,
    lossConfidence: row.lossConfidence,
    lossOutputAmount: row.lossOutputAmount,
    detectedAt: row.detectedAt,
  };
}
