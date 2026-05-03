import type { Redis } from "ioredis";
import type { JitoBundleInfo, JitoBundleResolver } from "@get-toasted/core";
import { logger as rootLogger, type Logger } from "./logger.js";

/**
 * Jito bundle resolver — answers "what bundle is this signature part of?"
 *
 * **Status: scaffolded, not enabled.** Jito does not publish a public
 * REST endpoint for `transaction-signature → bundle` reverse lookup.
 * Their docs (https://docs.jito.wtf/lowlatencytxnsend/) explicitly state
 * the only ways to query bundle membership are:
 *   - `getBundleStatuses` — requires the bundle id, which we don't have
 *   - `getInflightBundleStatuses` — 5-minute lookback, also bundle-id
 *     keyed
 *   - The Jito Explorer web UI — not programmatic
 *
 * Until we integrate a paid indexer (Helius MEV API, sandwiched.me,
 * Ghostlogs, or our own Jito Block Engine subscription), this resolver
 * returns null for every lookup. The orchestrator's L1 → L2 fallback
 * means tight bundled sandwiches are still detected — by L2's
 * nearest-neighbor adjacency rule — and the bundled-vs-direct
 * distinction is approximated via tip-transfer presence (set on
 * `LayerMatch.jitoBundled` from `ParsedSwap.jitoTipLamports`).
 *
 * When a real bundle resolver becomes available, swap the impl below
 * for the integration; the `JitoBundleResolver` interface and Redis
 * cache pattern are already in place. Keep the warning log so that any
 * production deploy without the integration is visibly degraded
 * rather than silently skipping L1.
 */

export type JitoBundleClient = JitoBundleResolver;

let warningEmitted = false;

export function createJitoBundleClient(opts: {
  // Kept on the signature so existing call sites (workers, tests) don't
  // have to change. The Redis handle will be used again once we wire a
  // real lookup with caching.
  redis: Redis;
  logger?: Logger;
}): JitoBundleClient {
  const log = (opts.logger ?? rootLogger).child({ component: "jito-bundle" });
  // Emit the disclaimer once per process — workers create the client
  // at startup, so this fires on boot.
  if (!warningEmitted) {
    warningEmitted = true;
    log.warn(
      "jito-bundle: L1 (ground-truth bundle membership) is disabled — " +
        "no public reverse-lookup API exists. Tight bundled sandwiches are " +
        "still detected by L2 adjacency; bundled-vs-direct labelling falls " +
        "back to tip-transfer detection. Wire a paid Jito indexer to enable L1.",
    );
  }
  return {
    async getBundleForTx(): Promise<JitoBundleInfo | null> {
      return null;
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
