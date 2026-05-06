import type { ParsedSwap } from "./types.js";
import type {
  JitoBundleResolver,
  LayerMatch,
  SandwichDetection,
} from "./detector-types.js";
import { detectL1JitoBundle } from "./detector-l1.js";
import { detectL2Adjacency } from "./detector-l2.js";
import { detectL3KnownBot } from "./detector-l3.js";
import { detectL4Statistical } from "./detector-l4.js";
import { computeLoss } from "./detector-loss.js";
import { passesPostFilters } from "./detector-filters.js";

export type {
  DetectionLayer,
  DetectionStatus,
  JitoBundleInfo,
  JitoBundleResolver,
  LayerMatch,
  LossCalculation,
  LossMethod,
  SandwichDetection,
} from "./detector-types.js";
export type { ParsedSwap, PoolReserves } from "./types.js";
export { isSandwichShape } from "./detector-l1.js";
export { detectL1JitoBundle } from "./detector-l1.js";
export { detectL2Adjacency } from "./detector-l2.js";
export { detectL3KnownBot } from "./detector-l3.js";
export { detectL4Statistical } from "./detector-l4.js";
export { computeLoss } from "./detector-loss.js";
export { passesPostFilters } from "./detector-filters.js";
export { getDexFeeBps, getPoolType, isCpmmDex } from "./dex-fees.js";

/**
 * detectSandwichForVictim — the layered classifier entry point.
 *
 * Runs L1 → L2 → L3 → L4 against the given victim swap and same-block
 * candidates. Short-circuits on the first match; the spec orders layers
 * by confidence so once a higher layer fires we don't re-test with
 * weaker signals.
 *
 * L5 (cross-slot wide sandwich) is intentionally not enabled here per §13:
 * ship L1-L4 first, validate against ground truth, then enable L5. The
 * orchestrator returns null if no layer fires — callers should NOT treat
 * null as "definitely not a sandwich"; it means "no confident detection
 * at this confidence tier."
 *
 * Inputs:
 *   - victim: a ParsedSwap belonging to the wallet being scanned
 *   - candidates: every other ParsedSwap in the same block on the same
 *     pool. The block expander provides this — we don't filter further
 *     here so that L2/L3/L4 can use txIndexInBlock directly.
 *   - jito: a bundle resolver (production: runtime/jito-bundle.ts,
 *           tests: in-memory stub)
 *
 * Returns a fully-scored SandwichDetection with loss + post-filters
 * applied, or null.
 */
export async function detectSandwichForVictim(params: {
  victim: ParsedSwap;
  candidates: ParsedSwap[];
  jito: JitoBundleResolver;
  now?: () => Date;
}): Promise<SandwichDetection | null> {
  const { victim, candidates, jito } = params;
  const now = params.now ?? (() => new Date());

  // Failed victim swaps can't be sandwiched in the meaningful sense —
  // the victim's swap reverted, no value exchanged. Skip cheaply.
  if (victim.failed) return null;

  // L1 — Jito bundle membership (highest confidence, currently disabled
  // pending a paid Jito indexer integration — always returns null).
  const l1 = await detectL1JitoBundle(victim, candidates, jito);

  // L2 — Block adjacency. Nearest-neighbor: finds the closest same-pool
  // swap pair (front before victim, back after) with matching signer and
  // reversed direction. Covers tight Jito-bundled and validator-direct attacks.
  const l2 = l1 === null ? detectL2Adjacency(victim, candidates) : null;

  // L3 — Known-bot same-slot. Fires when a bot in KNOWN_SANDWICH_BOTS
  // appears on the same pool with a sandwich shape, regardless of adjacency.
  // Catches attacks where L2's nearest-neighbor walk fails due to same-pool
  // noise or wider spacing between legs.
  const l3 = l1 === null && l2 === null ? detectL3KnownBot(victim, candidates) : null;

  // L4 — Statistical wide sandwich. Unknown bots, same block. Requires
  // sell-through ≥85%, non-negative proxy profit, size ratio 0.05-25x, and
  // index proximity ≤20. Confidence 0.65 (suspected).
  const l4 =
    l1 === null && l2 === null && l3 === null
      ? detectL4Statistical(victim, candidates)
      : null;

  const layerMatch: LayerMatch | null = l1 ?? l2 ?? l3 ?? l4;
  if (!layerMatch) return null;

  const detection: SandwichDetection = {
    ...layerMatch,
    loss: computeLoss(layerMatch),
    detectedAt: now(),
  };

  if (!passesPostFilters(detection)) return null;
  return detection;
}

/**
 * Convenience: run detection for every wallet swap against the
 * pre-expanded set of same-block swaps. This is the shape the scanner
 * worker uses — it pre-fetches blocks via the block-expander, then asks
 * the detector to classify each victim candidate.
 *
 * The candidates argument is the *full block-expanded swap list*, not
 * a per-wallet subset — we filter to same-pool, different-signature
 * inside this function so the caller doesn't have to think about it.
 */
export async function detectSandwichesForWalletSwaps(params: {
  wallet: string;
  walletSwaps: ParsedSwap[];
  blockSwaps: ParsedSwap[];
  jito: JitoBundleResolver;
  now?: () => Date;
}): Promise<SandwichDetection[]> {
  const { wallet, walletSwaps, blockSwaps, jito } = params;

  // Index block swaps by slot for O(1) lookup. Detection only operates
  // on swaps in the victim's slot — cross-slot detection (L5) is out of
  // scope until L4 is validated.
  const bySlot = new Map<string, ParsedSwap[]>();
  for (const s of blockSwaps) {
    const k = s.slot.toString();
    const bucket = bySlot.get(k);
    if (bucket) bucket.push(s);
    else bySlot.set(k, [s]);
  }

  const out: SandwichDetection[] = [];
  for (const victim of walletSwaps) {
    if (victim.signer !== wallet) continue; // attacker-as-wallet case
    const sameSlot = bySlot.get(victim.slot.toString()) ?? [];
    // Same-pool candidates excluding the victim itself. Sandwich shape
    // requires same pool; cross-pool legs are not sandwiches.
    const candidates = sameSlot.filter(
      (s) => s.pool === victim.pool && s.signature !== victim.signature,
    );

    const detection = await detectSandwichForVictim({
      victim,
      candidates,
      jito,
      now: params.now,
    });
    if (detection) out.push(detection);
  }

  return out;
}
