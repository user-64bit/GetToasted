import type { ParsedSwap } from "./types.js";
import type { LayerMatch } from "./detector-types.js";
import { isSandwichShape } from "./detector-l1.js";

/**
 * L2 — Block adjacency.
 *
 * A tight sandwich landed without Jito (validator-direct submission, slot
 * leader privilege, or a private orderflow channel). Front, victim, back
 * are at consecutive `txIndexInBlock` positions. Confidence 0.95.
 *
 * Why this is distinct from L1: not every bundled tx lands as adjacent
 * (other bundles may interleave), and not every adjacent triple is
 * bundled. We test bundle membership first because it's stronger; if
 * that fails, we fall back to raw block adjacency, which is the second
 * strongest signal we have.
 *
 * Adjacency detector adds one fact L1 doesn't have: a "back-run sells
 * what the front-run bought" sanity check (the tolerance band). True
 * sandwich back-runs sell ≥95% of the front-run output. Arbitrage
 * triplets with the *same shape* (X→Y, X→Y, Y→X) but different sizes
 * fail this check, killing a major source of false positives.
 */
export function detectL2Adjacency(
  victim: ParsedSwap,
  candidates: ParsedSwap[],
): LayerMatch | null {
  const frontRun = candidates.find(
    (c) =>
      c.txIndexInBlock === victim.txIndexInBlock - 1 && c.pool === victim.pool,
  );
  const backRun = candidates.find(
    (c) =>
      c.txIndexInBlock === victim.txIndexInBlock + 1 && c.pool === victim.pool,
  );
  if (!frontRun || !backRun) return null;
  // Failed front-run = no slippage caused. Reject. But a failed back-run
  // is still a victim-hurting attempt: the front-run landed, the victim
  // ate the slippage, and the bot tried (and failed) to extract. The
  // loss dispatcher routes these into the failed-backrun-slippage method.
  if (frontRun.failed) return null;

  if (!isSandwichShape(victim, frontRun, backRun)) return null;

  // Tolerance band: bot sells ≥95% of what it bought. Catches arb
  // triplets where the "back-run" is a small cleanup leg (size mismatch).
  // 95% allows for DEX fees consumed during the back-run swap itself.
  // Skip the band when the back-run failed — its inputAmount may be 0
  // or partial, but it's still a sandwich attempt that hurt the victim.
  if (!backRun.failed) {
    const tolerance = (frontRun.outputAmount * 95n) / 100n;
    if (backRun.inputAmount < tolerance) return null;
  }

  return {
    victim,
    frontRun,
    backRun,
    attacker: frontRun.signer,
    pool: victim.pool,
    layer: "L2",
    confidence: 0.95,
    status: "confirmed",
    jitoBundled: false,
    jitoTipLamports: 0n,
  };
}
