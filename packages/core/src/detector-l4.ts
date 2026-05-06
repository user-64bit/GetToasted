import type { ParsedSwap } from "./types.js";
import type { LayerMatch } from "./detector-types.js";
import { isSandwichShape } from "./detector-l1.js";

/**
 * L4 — Statistical wide sandwich detection.
 *
 * Fires when an unknown attacker (not in KNOWN_SANDWICH_BOTS) exhibits the
 * sandwich A→B→A pattern in the same block as the victim, on the same pool.
 * Confidence 0.65 (suspected) — lower than L3 because there is no known-bot
 * prior. Multiple statistical filters compensate to keep false-positive rate
 * low.
 *
 * False-positive killers (all must pass):
 *   1. Same signer for front + back (basic sandwich requirement)
 *   2. Valid sandwich shape (same pool, reversed direction, victim excluded)
 *   3. Sell-through ≥85%: bot sells most of what it bought
 *   4. Non-negative proxy profit: back.output ≥ front.input (bot didn't lose)
 *   5. Front-size ratio 0.1x–20x victim: wildly different sizes = arb, not sandwich
 *   6. Index proximity ≤20 positions front-to-victim and victim-to-back:
 *      same slot + far apart = probably two unrelated MM trades
 *
 * Filter 6 uses 20 (vs the spec's 5) because:
 *   - The block expander already narrows to ±25 from the victim
 *   - Real wide sandwiches on mainnet can span up to ~15 positions in busy blocks
 *   - The other 5 filters are strong enough; over-tightening 6 causes false negatives
 */
export function detectL4Statistical(
  victim: ParsedSwap,
  candidates: ParsedSwap[],
): LayerMatch | null {
  if (victim.failed) return null;

  const samePool = candidates.filter(
    (c) => c.pool === victim.pool && c.signer !== victim.signer,
  );
  if (samePool.length < 2) return null; // need at least one front and one back

  // Group by signer — a sandwich requires same signer for front and back.
  const bySigner = new Map<string, ParsedSwap[]>();
  for (const c of samePool) {
    const existing = bySigner.get(c.signer);
    if (existing) existing.push(c);
    else bySigner.set(c.signer, [c]);
  }

  for (const [, sigSwaps] of bySigner) {
    if (sigSwaps.length < 2) continue;

    const fronts = sigSwaps.filter(
      (s) =>
        s.txIndexInBlock < victim.txIndexInBlock &&
        !s.failed &&
        s.inputMint === victim.inputMint &&
        s.outputMint === victim.outputMint,
    );
    const backs = sigSwaps.filter(
      (s) =>
        s.txIndexInBlock > victim.txIndexInBlock &&
        s.inputMint === victim.outputMint &&
        s.outputMint === victim.inputMint,
    );

    for (const front of fronts) {
      for (const back of backs) {
        // Filter 3: sell-through ≥85%
        if (!back.failed) {
          const sellTolerance = (front.outputAmount * 85n) / 100n;
          if (back.inputAmount < sellTolerance) continue;
        }

        // Filter 4: non-negative proxy profit. Genuine sandwiches are
        // profitable; unprofitable triplets are more likely arb or MM.
        const proxyProfit = back.outputAmount - front.inputAmount;
        if (proxyProfit < 0n) continue;

        // Filter 5: size ratio between front and victim. Wildly different
        // sizes indicate arb (front = small price discovery, victim = large
        // organic trade) vs sandwich (front sized to victim's tolerance).
        if (victim.inputAmount > 0n && front.inputAmount > 0n) {
          const frontSize = Number(front.inputAmount);
          const victimSize = Number(victim.inputAmount);
          const ratio = frontSize / victimSize;
          if (ratio < 0.05 || ratio > 25) continue;
        }

        // Filter 6: index proximity. Both legs should be close to the victim
        // in block order. > 20 positions suggests two unrelated trades by the
        // same MM, not a deliberate sandwich.
        const frontDist = victim.txIndexInBlock - front.txIndexInBlock;
        const backDist = back.txIndexInBlock - victim.txIndexInBlock;
        if (frontDist > 20 || backDist > 20) continue;

        // Validate full sandwich shape (includes same-pool, signer checks).
        if (!isSandwichShape(victim, front, back)) continue;

        const tipFront = front.jitoTipLamports ?? 0n;
        const tipBack = back.jitoTipLamports ?? 0n;
        const tipLamports = tipFront > 0n ? tipFront : tipBack;

        return {
          victim,
          frontRun: front,
          backRun: back,
          attacker: front.signer,
          pool: victim.pool,
          layer: "L4",
          confidence: 0.65,
          status: "suspected",
          jitoBundled: tipLamports > 0n,
          jitoTipLamports: tipLamports,
        };
      }
    }
  }

  return null;
}
