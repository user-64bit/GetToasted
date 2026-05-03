import type { SandwichDetection } from "./detector-types.js";

/**
 * Post-detection guards. Run *after* a layer has fired and loss has been
 * calculated, *before* persistence. These exist to catch the residual
 * false positives that the layered classifier can't filter on its own.
 *
 * Each guard is fail-closed: returning `false` drops the detection.
 *
 *   - Guard 1: self-sandwich (attacker == victim)
 *   - Guard 2: negligible loss (< $0.01 OR < 0.1% of victim trade size)
 *
 * Round-trip arbitrage by the victim is implicitly handled by Guard 1
 * (their own swap as front+back+victim shares signer with victim).
 *
 * The L4 statistical-recurrence threshold mentioned in the spec is
 * out-of-scope for this layer — it's a periodic post-processing concern,
 * not a synchronous guard.
 */
export function passesPostFilters(detection: SandwichDetection): boolean {
  // Guard 1: self-sandwich. Belt-and-suspenders — the layer detectors
  // already exclude self-signer matches, but if a bot ever signs from
  // multiple aliases under the same beneficiary we want one more chance
  // to catch it via the wallet match.
  if (detection.attacker === detection.victim.signer) return false;

  // Guard 2a: negligible USD loss. < $0.01 = below our reporting
  // resolution. Skip the guard entirely if loss USD wasn't computed
  // (long-tail memecoin with no price oracle data) — the loss is real,
  // we just can't denominate it.
  if (detection.loss.lossUsd !== null && detection.loss.lossUsd < 0.01) {
    return false;
  }

  // Guard 2b: negligible relative loss. < 0.1% of the victim's output
  // is statistical noise from rounding, fees on the back-run, or
  // arbitrage residual. Real sandwiches typically extract 0.5-5%.
  if (detection.victim.outputAmount > 0n) {
    // Compute lossPct as a ratio of bigints, then convert. Doing this in
    // pure float (Number(loss) / Number(out)) loses precision on large
    // memecoin amounts (>2^53 base units).
    const ratioPpm =
      (detection.loss.lossInOutputToken * 1_000_000n) /
      detection.victim.outputAmount;
    if (ratioPpm < 1_000n) {
      // < 0.1% (1000 ppm)
      return false;
    }
  }

  return true;
}
