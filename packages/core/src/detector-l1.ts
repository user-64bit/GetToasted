import type { ParsedSwap } from "./types.js";
import type {
  JitoBundleInfo,
  JitoBundleResolver,
  LayerMatch,
} from "./detector-types.js";

/**
 * L1 — Jito-bundle membership.
 *
 * The strongest sandwich signal we have. If three swaps land in the same
 * Jito bundle and form an A→B→A pattern around the victim, the bot
 * deliberately bundled them — this is a co-bundled sandwich. Confidence 1.00.
 *
 * Inputs:
 *   - victim: the wallet's swap we're testing
 *   - candidates: every other swap in the same block on the same pool
 *   - jito: resolver that fetches bundle membership for a signature
 *           (caller is expected to have caching — see runtime/jito-bundle.ts)
 *
 * Returns null if:
 *   - victim's tx is not in any bundle
 *   - victim is at index 0 (jito-dontfront usage) or last (no back-run)
 *   - the candidates around the victim don't form a sandwich shape
 *
 * Why we validate the *shape* even when bundled: Jito bundles are also
 * used legitimately by arbers and MM strategies. Co-bundling alone isn't
 * proof of a sandwich — we also require:
 *   - same signer for front and back
 *   - front direction matches victim direction
 *   - back direction reversed
 *   - victim and attacker are different signers
 */
export async function detectL1JitoBundle(
  victim: ParsedSwap,
  candidates: ParsedSwap[],
  jito: JitoBundleResolver,
): Promise<LayerMatch | null> {
  let victimBundle: JitoBundleInfo | null;
  try {
    victimBundle = await jito.getBundleForTx(victim.signature);
  } catch {
    // Jito API hiccup — fail closed for L1 and let lower layers run.
    return null;
  }
  if (!victimBundle) return null;

  const victimIdx = victimBundle.signaturesInBundle.indexOf(victim.signature);
  if (victimIdx <= 0) return null; // victim at front == not a victim
  if (victimIdx === victimBundle.signaturesInBundle.length - 1) return null; // no back-run

  const frontSig = victimBundle.signaturesInBundle[victimIdx - 1];
  const backSig = victimBundle.signaturesInBundle[victimIdx + 1];
  if (!frontSig || !backSig) return null;

  const frontRun = candidates.find((c) => c.signature === frontSig);
  const backRun = candidates.find((c) => c.signature === backSig);
  // Bundle includes a non-DEX tx (e.g. tip transfer) between victim and
  // the bot's swaps. Without the actual swap legs we can't validate the
  // sandwich shape, so we fail closed.
  if (!frontRun || !backRun) return null;

  if (!isSandwichShape(victim, frontRun, backRun)) return null;

  return {
    victim,
    frontRun,
    backRun,
    attacker: frontRun.signer,
    pool: victim.pool,
    layer: "L1",
    confidence: 1.0,
    status: "confirmed",
    jitoBundled: true,
    jitoTipLamports: victimBundle.tipLamports,
  };
}

// Same-pool, same-signer (f+b), reversed direction, distinct from victim.
// Identical predicate is reused by L2 and L3 — keep it here next to L1
// since L1 ships first and the others import from this module.
export function isSandwichShape(
  victim: ParsedSwap,
  frontRun: ParsedSwap,
  backRun: ParsedSwap,
): boolean {
  if (frontRun.signer !== backRun.signer) return false;
  if (frontRun.signer === victim.signer) return false; // self-sandwich excluded
  if (frontRun.pool !== victim.pool) return false;
  if (backRun.pool !== victim.pool) return false;
  if (frontRun.inputMint !== victim.inputMint) return false;
  if (frontRun.outputMint !== victim.outputMint) return false;
  if (backRun.inputMint !== frontRun.outputMint) return false;
  if (backRun.outputMint !== frontRun.inputMint) return false;
  return true;
}
