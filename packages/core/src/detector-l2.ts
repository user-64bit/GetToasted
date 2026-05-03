import type { ParsedSwap } from "./types.js";
import type { LayerMatch } from "./detector-types.js";
import { isSandwichShape } from "./detector-l1.js";

/**
 * L2 — block-position adjacency, relaxed to nearest neighbor.
 *
 * The strict "front at txIndex-1, back at txIndex+1" rule from the
 * original spec misses real sandwiches because:
 *   1. Bots often emit a separate tip-transfer tx between legs of a
 *      Jito bundle. Bundle txs land contiguously, but the tip transfer
 *      is a system-program tx — not a tracked-DEX swap, so it isn't in
 *      our `candidates` list, but it DOES advance the absolute block
 *      index. Strict adjacency fails; the sandwich is silently missed.
 *   2. Validator-direct sandwiches without Jito sometimes land with
 *      one or two unrelated txs between legs (priority-fee jockeying,
 *      retry-due-to-blockhash, etc.).
 *
 * Relaxed rule: for the victim, find the *immediately preceding* and
 * *immediately following* same-pool candidates (ignoring non-DEX txs)
 * by `txIndexInBlock`. If they have the same signer, form a valid
 * sandwich shape, and the back-run sells ≥95% of the front-run output,
 * we have a tight sandwich. The space we search is `candidates` — same
 * block, already filtered to same-pool by the orchestrator.
 *
 * Why confidence stays at 0.95 (not lower):
 *   - The shape predicate (same-pool, same f+b signer, reversed
 *     direction) is strict. Random arb triplets don't pass it.
 *   - The 95% sell-through tolerance kills size-mismatched arb shapes.
 *   - With same-pool + same-signer + reversed direction + sell-through,
 *     the false-positive surface is essentially zero. The relaxation
 *     widens *which* sandwiches we catch, not *what we count as one*.
 *
 * Tip-transfer detection: a Jito-bundled sandwich's front (or back)
 * carries a non-zero tip in `jitoTipLamports`, populated by the parser
 * from native transfers to known Jito tip accounts. We carry that into
 * `LayerMatch.jitoBundled` / `jitoTipLamports` as a heuristic — distinct
 * from L1's (currently disabled) ground-truth bundle membership but
 * good enough to label the row as "bundled" in the dashboard.
 */
export function detectL2Adjacency(
  victim: ParsedSwap,
  candidates: ParsedSwap[],
): LayerMatch | null {
  // Same-pool, not the victim's own signer, and not the victim itself.
  // We also drop self-failed candidates here — the loss dispatcher
  // handles failed back-runs separately, but a failed front-run means
  // no slippage was caused and there's no sandwich to detect.
  const samePool = candidates.filter(
    (c) => c.pool === victim.pool && c.signer !== victim.signer,
  );
  if (samePool.length === 0) return null;

  // Closest-preceding-first / closest-following-first ordering. We
  // walk fronts outward and, for each, search for a matching back.
  // This finds the tightest valid pair around the victim — the bot's
  // own legs win over any unrelated traders that may sit slightly
  // farther out, because their signers won't pair up.
  const beforeDesc = samePool
    .filter((c) => c.txIndexInBlock < victim.txIndexInBlock && !c.failed)
    .sort((a, b) => b.txIndexInBlock - a.txIndexInBlock);
  const afterAsc = samePool
    .filter((c) => c.txIndexInBlock > victim.txIndexInBlock)
    .sort((a, b) => a.txIndexInBlock - b.txIndexInBlock);

  for (const front of beforeDesc) {
    for (const back of afterAsc) {
      if (back.signer !== front.signer) continue;
      if (!isSandwichShape(victim, front, back)) continue;

      // Tolerance band: bot sells ≥95% of what it bought. Skip the
      // band when the back-run failed — its inputAmount may be 0 or
      // partial, but it's still a sandwich attempt that hurt the
      // victim, and the loss dispatcher routes it to failed-backrun.
      if (!back.failed) {
        const tolerance = (front.outputAmount * 95n) / 100n;
        if (back.inputAmount < tolerance) continue;
      }

      // Tip-transfer heuristic for "bundled or not". Either leg may
      // carry the tip in practice — Jito allows the tip on any tx in
      // the bundle, and bots vary which one they put it on.
      const tipFront = front.jitoTipLamports ?? 0n;
      const tipBack = back.jitoTipLamports ?? 0n;
      const tipLamports = tipFront > 0n ? tipFront : tipBack;

      return {
        victim,
        frontRun: front,
        backRun: back,
        attacker: front.signer,
        pool: victim.pool,
        layer: "L2",
        confidence: 0.95,
        status: "confirmed",
        jitoBundled: tipLamports > 0n,
        jitoTipLamports: tipLamports,
      };
    }
  }

  return null;
}
