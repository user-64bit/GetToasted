import type { Redis } from "ioredis";
import type { JitoBundleInfo, JitoBundleResolver } from "@get-toasted/core";
import { logger as rootLogger, type Logger } from "./logger.js";
import {
  JITO_BUNDLE_HIT_TTL_SECONDS,
  JITO_BUNDLE_MISS_TTL_SECONDS,
  redisKeys,
} from "./redis-keys.js";

/**
 * Jito bundle resolver — answers "what bundle is this signature part of?"
 * by querying the Jito bundles API, with Redis caching.
 *
 * Bundles are the strongest sandwich signal we have (L1 detection at
 * confidence 1.00). The Jito block engine provides a public lookup API
 * that returns the bundle id, ordered signatures, landed slot, and tip.
 *
 * Caching strategy:
 *   - Hit (signature is in a bundle) → 7 days. Bundles never change once
 *     landed, so this is essentially permanent.
 *   - Miss (signature is not in any bundle) → 1 hour. Slightly aggressive
 *     because the Jito index can lag for a few minutes after a slot
 *     finalizes; we'd rather re-query than persist a wrong "no bundle"
 *     answer indefinitely.
 *   - The cache also prevents the common case from hitting the network
 *     repeatedly: a single wallet scan can produce hundreds of swaps,
 *     and we lookup each of them at the L1 step.
 *
 * Failure mode: a network error returns null (i.e., "no bundle found").
 * This is fail-closed for L1 — the orchestrator falls back to L2 when L1
 * returns null, so a flaky Jito API doesn't block detection. We log the
 * failure but don't poison the cache.
 *
 * Rate limit: Jito unauthenticated allows ~5 RPS. We don't enforce this
 * here (no token bucket) — if you hit it in production, the API returns
 * 429 and we treat that as a miss. With Redis caching working, the
 * sustained rate stays well below 5 RPS even for heavy scans.
 */

const JITO_BUNDLES_API = "https://bundles.jito.wtf/api/v1/bundles/transaction";

type JitoBundleApiResponse = {
  bundle_id: string;
  transactions: string[];
  slot?: number;
  landed_slot?: number;
  // Jito API returns tip in lamports; field naming has shifted between
  // versions. We accept both `tip` and `landed_tip_lamports`.
  tip?: number | string;
  landed_tip_lamports?: number | string;
} | null;

type CacheEntry = {
  // discriminated by `present` so we can negative-cache without nulls
  // serializing weirdly.
  present: boolean;
  bundle?: {
    bundleId: string;
    signaturesInBundle: string[];
    landedSlot: number;
    tipLamports: string; // bigint serialized
  };
};

export type JitoBundleClient = JitoBundleResolver;

export function createJitoBundleClient(opts: {
  redis: Redis;
  logger?: Logger;
  // Override the API URL — used by tests with a local stub.
  apiUrl?: string;
  // Optional API key for authenticated rate limit (50 RPS vs 5 RPS).
  apiKey?: string;
  // Override the fetch implementation — also used by tests.
  fetchFn?: typeof fetch;
}): JitoBundleClient {
  const { redis, apiKey } = opts;
  const log = (opts.logger ?? rootLogger).child({ component: "jito-bundle" });
  const apiUrl = opts.apiUrl ?? JITO_BUNDLES_API;
  const fetchImpl = opts.fetchFn ?? fetch;

  const fetchOnce = async (signature: string): Promise<JitoBundleInfo | null> => {
    const url = `${apiUrl}/${encodeURIComponent(signature)}`;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (apiKey) headers["x-jito-api-key"] = apiKey;

    let res: Response;
    try {
      res = await fetchImpl(url, { headers });
    } catch (err) {
      log.debug({ err, signature }, "jito-bundle: fetch failed");
      return null;
    }

    if (res.status === 404) return null; // not in any bundle
    if (!res.ok) {
      log.debug(
        { signature, status: res.status },
        "jito-bundle: non-200 — treating as miss",
      );
      return null;
    }

    let json: JitoBundleApiResponse;
    try {
      json = (await res.json()) as JitoBundleApiResponse;
    } catch (err) {
      log.debug({ err, signature }, "jito-bundle: parse failed");
      return null;
    }
    if (!json || !json.bundle_id) return null;

    const tipRaw = json.landed_tip_lamports ?? json.tip ?? 0;
    let tipLamports: bigint;
    try {
      tipLamports =
        typeof tipRaw === "string"
          ? BigInt(tipRaw)
          : BigInt(Math.max(0, Math.floor(tipRaw)));
    } catch {
      tipLamports = 0n;
    }

    return {
      bundleId: json.bundle_id,
      signaturesInBundle: Array.isArray(json.transactions) ? json.transactions : [],
      landedSlot: json.landed_slot ?? json.slot ?? 0,
      tipLamports,
    };
  };

  const getBundleForTx = async (
    signature: string,
  ): Promise<JitoBundleInfo | null> => {
    if (!signature) return null;
    const key = redisKeys.jitoBundleBySig(signature);

    const cached = await redis.get(key);
    if (cached !== null) {
      try {
        const entry = JSON.parse(cached) as CacheEntry;
        if (!entry.present) return null;
        if (!entry.bundle) return null;
        return {
          bundleId: entry.bundle.bundleId,
          signaturesInBundle: entry.bundle.signaturesInBundle,
          landedSlot: entry.bundle.landedSlot,
          tipLamports: BigInt(entry.bundle.tipLamports),
        };
      } catch {
        // Corrupt cache entry — drop and refetch.
        await redis.del(key).catch(() => undefined);
      }
    }

    const fresh = await fetchOnce(signature);
    if (fresh) {
      const entry: CacheEntry = {
        present: true,
        bundle: {
          bundleId: fresh.bundleId,
          signaturesInBundle: fresh.signaturesInBundle,
          landedSlot: fresh.landedSlot,
          tipLamports: fresh.tipLamports.toString(),
        },
      };
      await redis
        .set(key, JSON.stringify(entry), "EX", JITO_BUNDLE_HIT_TTL_SECONDS)
        .catch(() => undefined);
      return fresh;
    }
    // Negative cache.
    const miss: CacheEntry = { present: false };
    await redis
      .set(key, JSON.stringify(miss), "EX", JITO_BUNDLE_MISS_TTL_SECONDS)
      .catch(() => undefined);
    return null;
  };

  return { getBundleForTx };
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
