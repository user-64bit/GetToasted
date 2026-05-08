import type { Redis } from "ioredis";
import type { JitoBundleInfo, JitoBundleResolver } from "@get-toasted/core";
import { logger as rootLogger, type Logger } from "./logger.js";
import {
  JITO_BUNDLE_MISSING_TTL_SECONDS,
  JITO_BUNDLE_TTL_SECONDS,
  redisKeys,
} from "./redis-keys.js";

/**
 * Jito bundle resolver — answers "what bundle is this signature part of?"
 *
 * Two public Jito endpoints are chained per cache miss:
 *   1. GET bundles.jito.wtf/api/v1/bundles/transaction/{signature}
 *      → `[{bundle_id, slot, ...}]` or `[]` / 404 when the signature is
 *      not in any landed bundle.
 *   2. GET bundles.jito.wtf/api/v1/bundles/bundle/{bundleId}
 *      → `[{bundle_id, slot, txSignatures, landedTipLamports, ...}]`,
 *      which is what we actually need for L1 (signature ordering and
 *      tip lamports).
 *
 * Verified working against the canonical Komeko bundle on 2026-05-07
 * (research/api-verifications/jito-bundle-response.json). Earlier
 * versions of this file shipped a no-op stub on the assumption that no
 * public reverse-lookup existed; that was wrong.
 *
 * Caching — every signature lookup writes either the JitoBundleInfo or a
 * `null` sentinel. Most signatures aren't in bundles, so the negative
 * sentinel keeps L1 cheap on warm caches. We do NOT cache by bundleId
 * separately; the per-signature cache key already covers all callers we
 * have today.
 */

export type JitoBundleClient = JitoBundleResolver;

const JITO_BUNDLE_API = "https://bundles.jito.wtf/api/v1/bundles";
const NULL_SENTINEL = "null";

type SerializedBundle = {
  bundleId: string;
  signaturesInBundle: string[];
  landedSlot: number;
  // bigint serialized as decimal string
  tipLamports: string;
};

function serialize(info: JitoBundleInfo): string {
  const payload: SerializedBundle = {
    bundleId: info.bundleId,
    signaturesInBundle: info.signaturesInBundle,
    landedSlot: info.landedSlot,
    tipLamports: info.tipLamports.toString(),
  };
  return JSON.stringify(payload);
}

function deserialize(raw: string): JitoBundleInfo | null {
  try {
    const parsed = JSON.parse(raw) as SerializedBundle;
    return {
      bundleId: parsed.bundleId,
      signaturesInBundle: parsed.signaturesInBundle,
      landedSlot: parsed.landedSlot,
      tipLamports: BigInt(parsed.tipLamports),
    };
  } catch {
    return null;
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (res.status === 404) return null;
  const body = await res.text();
  if (!res.ok) {
    // Jito returns "Bundle not found" with 200 sometimes, 404 othertimes.
    if (body.includes("not found") || body.includes("Bundle not found")) return null;
    throw new Error(`jito ${url} ${res.status}: ${body.slice(0, 200)}`);
  }
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

async function lookupBundleForSignature(
  signature: string,
): Promise<JitoBundleInfo | null> {
  const txJson = (await fetchJson(`${JITO_BUNDLE_API}/transaction/${signature}`)) as
    | Array<{ bundleId?: string; bundle_id?: string }>
    | null;
  if (!Array.isArray(txJson) || txJson.length === 0) return null;
  const bundleId = txJson[0]?.bundleId ?? txJson[0]?.bundle_id;
  if (!bundleId) return null;

  const bundleJson = (await fetchJson(`${JITO_BUNDLE_API}/bundle/${bundleId}`)) as
    | Array<{
        bundleId?: string;
        bundle_id?: string;
        slot?: number;
        landedTipLamports?: number | string;
        landed_tip_lamports?: number | string;
        txSignatures?: string[];
        transactions?: string[];
        tx_signatures?: string[];
      }>
    | null;
  if (!Array.isArray(bundleJson) || bundleJson.length === 0) return null;
  const b = bundleJson[0]!;

  const txs = b.txSignatures ?? b.transactions ?? b.tx_signatures ?? [];
  if (!Array.isArray(txs) || txs.length === 0) return null;

  const tipRaw = b.landedTipLamports ?? b.landed_tip_lamports ?? 0;
  const tipLamports =
    typeof tipRaw === "string" ? BigInt(tipRaw) : BigInt(Math.trunc(Number(tipRaw)));

  return {
    bundleId,
    signaturesInBundle: txs,
    landedSlot: Number(b.slot ?? 0),
    tipLamports,
  };
}

export function createJitoBundleClient(opts: {
  redis: Redis;
  logger?: Logger;
}): JitoBundleClient {
  const { redis } = opts;
  const log = (opts.logger ?? rootLogger).child({ component: "jito-bundle" });

  return {
    async getBundleForTx(signature: string): Promise<JitoBundleInfo | null> {
      if (!signature) return null;
      const cacheKey = redisKeys.jitoBundleByTx(signature);

      const cached = await redis.get(cacheKey).catch(() => null);
      if (cached === NULL_SENTINEL) return null;
      if (cached) {
        const parsed = deserialize(cached);
        if (parsed) return parsed;
        // Corrupt entry — fall through to refetch.
      }

      let info: JitoBundleInfo | null;
      try {
        info = await lookupBundleForSignature(signature);
      } catch (err) {
        log.warn(
          { err, signature },
          "jito-bundle: lookup failed — fail closed (return null, don't cache)",
        );
        return null;
      }

      await redis
        .set(
          cacheKey,
          info ? serialize(info) : NULL_SENTINEL,
          "EX",
          info ? JITO_BUNDLE_TTL_SECONDS : JITO_BUNDLE_MISSING_TTL_SECONDS,
        )
        .catch(() => undefined);

      return info;
    },
  };
}

/**
 * In-memory bundle resolver — for tests and any caller that wants to
 * inject deterministic bundle data without a Redis dependency.
 */
export function createInMemoryJitoBundleClient(
  bundles: Iterable<JitoBundleInfo>,
): JitoBundleClient {
  const bySig = new Map<string, JitoBundleInfo>();
  for (const b of bundles) {
    for (const sig of b.signaturesInBundle) {
      bySig.set(sig, b);
    }
  }
  return {
    async getBundleForTx(signature: string): Promise<JitoBundleInfo | null> {
      return bySig.get(signature) ?? null;
    },
  };
}

/**
 * No-network resolver that always returns null. Use in tests or contexts
 * where you don't want the live Jito client (e.g. local dev, fixture
 * replay) but the orchestrator still expects a JitoBundleResolver. L1
 * never fires; L2-L4 still run.
 */
export function createNullJitoBundleClient(): JitoBundleClient {
  return {
    async getBundleForTx(): Promise<JitoBundleInfo | null> {
      return null;
    },
  };
}
