import type { ParsedSwap } from "./types.js";
import type { LayerMatch } from "./detector-types.js";
import { isSandwichShape } from "./detector-l1.js";
import { KNOWN_SANDWICH_BOTS } from "./known-bots.js";

/**
 * L3 — Known-bot same-slot detection.
 *
 * Fires when a signer in `KNOWN_SANDWICH_BOTS` appears in the victim's
 * block with an A→B→A pattern around the victim on the same pool.
 * Confidence 0.85 (confirmed) — lower than L2 because we're relaxing
 * the adjacency requirement, but the known-bot attribution adds strong
 * signal that compensates.
 *
 * Why L3 is necessary even when L2 is correct:
 *   L2 finds the *nearest-neighbor* swap pair that forms a valid sandwich
 *   shape. If an unrelated trader hits the same pool between the bot's
 *   front-run and the victim, L2's "closest before / closest after" walk
 *   finds them first. Their signer doesn't match the back-run's signer →
 *   L2 keeps walking outward and eventually finds the bot — this part is
 *   fine. But if >5 interleaving same-pool swaps exist (busy token launch
 *   blocks), L2's walk may exhaust without finding the bot.
 *   L3 short-circuits by filtering to known bots directly.
 *
 * The "front must be BEFORE victim, back must be AFTER victim" ordering
 * uses `txIndexInBlock`, the same field L2 uses.
 *
 * Sell-through tolerance is relaxed to 90% vs L2's 95% — known bots
 * sometimes close positions across multiple txs; we'd rather flag and
 * let the loss calc show a smaller number than miss the attack entirely.
 */
export function detectL3KnownBot(
  victim: ParsedSwap,
  candidates: ParsedSwap[],
): LayerMatch | null {
  if (victim.failed) return null;

  // Filter candidates to known-bot signers on the same pool, excluding
  // the victim's own signer (self-sandwich guard).
  const botCandidates = candidates.filter(
    (c) =>
      c.pool === victim.pool &&
      c.signer !== victim.signer &&
      KNOWN_SANDWICH_BOTS.has(c.signer) &&
      !c.failed, // failed front-run caused no slippage
  );
  if (botCandidates.length === 0) return null;

  // Partition into potential fronts (before victim) and backs (after victim).
  const potentialFronts = botCandidates
    .filter((c) => c.txIndexInBlock < victim.txIndexInBlock)
    .sort((a, b) => b.txIndexInBlock - a.txIndexInBlock); // closest first

  const potentialBacks = botCandidates.filter(
    (c) => c.txIndexInBlock > victim.txIndexInBlock,
  );

  for (const front of potentialFronts) {
    // Matching back: same bot signer, reversed direction, after victim.
    const back = potentialBacks.find(
      (c) =>
        c.signer === front.signer &&
        c.inputMint === front.outputMint &&
        c.outputMint === front.inputMint,
    );
    if (!back) continue;

    if (!isSandwichShape(victim, front, back)) continue;

    // Sell-through tolerance: bot sells ≥90% of what it bought.
    // Relaxed from L2's 95% — known bots sometimes split the close leg
    // across multiple txs (partial fills on CLMM).
    const tolerance = (front.outputAmount * 90n) / 100n;
    if (!back.failed && back.inputAmount < tolerance) continue;

    const tipFront = front.jitoTipLamports ?? 0n;
    const tipBack = back.jitoTipLamports ?? 0n;
    const tipLamports = tipFront > 0n ? tipFront : tipBack;

    return {
      victim,
      frontRun: front,
      backRun: back,
      attacker: front.signer,
      pool: victim.pool,
      layer: "L3",
      confidence: 0.85,
      status: "confirmed",
      jitoBundled: tipLamports > 0n,
      jitoTipLamports: tipLamports,
    };
  }

  return null;
}
