import { SOL_MINT } from "./pricing.js";
import type { ParsedSwap, PoolReserves } from "./types.js";
import type { LayerMatch, LossCalculation } from "./detector-types.js";
import { getDexFeeBps, isCpmmDex } from "./dex-fees.js";

/**
 * Loss dispatcher — picks the right reconstruction method for a detection
 * and produces the canonical `LossCalculation`. USD denomination is layered
 * on top by the caller (see runtime/scanner enrichDetection).
 *
 * Method order:
 *   1. CPMM reconstruction — exact x·y=k counterfactual. Requires CPMM
 *      pool + reserves before the front-run.
 *   2. Back-run profit proxy — bot's profit ≈ victim's loss. Works for
 *      all profitable sandwiches (CLMM included).
 *   3. Failed back-run slippage — back-run reverted; victim still got
 *      slipped by the front-run. Estimated, not exact.
 */
export function computeLoss(match: LayerMatch): LossCalculation {
  const { victim, frontRun, backRun } = match;

  // Method A: CPMM reconstruction — only when reserves are available
  // AND the reserve mints actually match the swap's mints. The
  // reserve-inference heuristic in the block expander can occasionally
  // mis-identify the vault pair (custom routes, wrapped-SOL ATAs that
  // look like vaults). reconstructCpmmLoss signals that case by
  // returning lossConfidence === 0; we fall through to the proxy
  // instead of returning a zero-loss row that the post-filter would
  // drop anyway. This is the difference between "we found a sandwich
  // but couldn't price it precisely" and "no sandwich found" — the
  // former is what we want for the dashboard.
  if (
    isCpmmDex(victim.dex) &&
    frontRun.poolReservesBefore !== null &&
    frontRun.poolReservesBefore !== undefined
  ) {
    const cpmm = reconstructCpmmLoss(
      victim,
      frontRun.poolReservesBefore,
      victim.dex,
    );
    if (cpmm.lossConfidence > 0) return cpmm;
    // fall through to proxy / failed-backrun
  }

  // Method C: Failed back-run — bot's back-run reverted. The victim
  // still ate the front-run's slippage; estimate from front-run's own
  // implied price vs victim's implied price.
  if (backRun.failed || backRun.outputAmount <= frontRun.inputAmount) {
    return failedBackrunLoss(victim, frontRun);
  }

  // Method B: Back-run profit proxy — default for CLMM and any case
  // where reserves aren't available or were mint-mismatched.
  return backrunProxyLoss(victim, frontRun, backRun, match.jitoTipLamports);
}

/**
 * CPMM reconstruction. The pool obeys x·y=k. We replay the victim's swap
 * against the *pre-front-run* reserves to get the counterfactual output.
 *
 * Edge cases:
 *   - If we can't determine which side of the pool the victim is selling
 *     (mints don't match either tokenAMint or tokenBMint), the math is
 *     bogus — fall through to the proxy method.
 *   - If `lossInOutputToken` would be negative (counterfactual < actual,
 *     can happen with 0-fee assumptions or bad data), clamp to zero rather
 *     than report a negative loss.
 */
export function reconstructCpmmLoss(
  victim: ParsedSwap,
  reservesBefore: PoolReserves,
  dex: ParsedSwap["dex"],
): LossCalculation {
  const isVictimSellingTokenA = victim.inputMint === reservesBefore.tokenAMint;
  const isVictimSellingTokenB = victim.inputMint === reservesBefore.tokenBMint;
  if (!isVictimSellingTokenA && !isVictimSellingTokenB) {
    // Mint mismatch — fall back to a zero-confidence noop. Caller will
    // pick this up via the dispatcher and try the proxy instead.
    return {
      method: "backrun-profit-proxy",
      actualOutput: victim.outputAmount,
      counterfactualOutput: victim.outputAmount,
      lossInOutputToken: 0n,
      lossUsd: null,
      lossConfidence: 0,
    };
  }

  const xBefore = isVictimSellingTokenA
    ? reservesBefore.tokenA
    : reservesBefore.tokenB;
  const yBefore = isVictimSellingTokenA
    ? reservesBefore.tokenB
    : reservesBefore.tokenA;

  if (xBefore <= 0n || yBefore <= 0n) {
    return {
      method: "backrun-profit-proxy",
      actualOutput: victim.outputAmount,
      counterfactualOutput: victim.outputAmount,
      lossInOutputToken: 0n,
      lossUsd: null,
      lossConfidence: 0,
    };
  }

  const k = xBefore * yBefore;
  const feeBps = getDexFeeBps(dex);
  const feeAdjustedInput = (victim.inputAmount * (10_000n - feeBps)) / 10_000n;

  // out = y - k / (x + in_after_fee). Integer math; no rounding errors
  // since all inputs are bigints.
  const newX = xBefore + feeAdjustedInput;
  const newY = k / newX;
  // BigInt division truncates toward zero, so the counterfactual is a
  // very slight underestimate of the real CPMM result. The error is
  // bounded by 1 base unit (sub-lamport for SOL, sub-cent for USDC).
  const counterfactualOutput = yBefore - newY;

  // Sanity guard: counterfactual >= actual. Without the front-run, the
  // victim should get *at least* what they actually got (the front-run
  // can only worsen the price for the same-direction victim). If we
  // compute the opposite, the inferred reserves are wrong — typically
  // because `inferPoolReservesFromTx` picked a non-pool token account
  // when multiple non-signer balances of the same mint exist in the tx.
  // Bail with lossConfidence: 0 so the dispatcher falls through to
  // backrun-profit-proxy. Detection is still emitted; only the loss
  // method changes.
  if (counterfactualOutput < victim.outputAmount) {
    return {
      method: "backrun-profit-proxy",
      actualOutput: victim.outputAmount,
      counterfactualOutput: victim.outputAmount,
      lossInOutputToken: 0n,
      lossUsd: null,
      lossConfidence: 0,
    };
  }

  const lossInOutputToken = counterfactualOutput - victim.outputAmount;

  return {
    method: "cpmm-reconstruction",
    actualOutput: victim.outputAmount,
    counterfactualOutput,
    lossInOutputToken,
    lossUsd: null,
    lossConfidence: 1.0,
  };
}

/**
 * Back-run profit proxy. The bot's realized profit (in front-run input
 * units) is a good proxy for the victim's loss, because in a CPMM the
 * profit comes from the same slippage the victim ate.
 *
 * Conversion: bot's profit is in input-token units. Convert to victim
 * output-token units by the victim's *implied* exchange rate
 * (output / input). This is approximate — the rate moved during the
 * attack — so we tag the result with confidence 0.85.
 */
export function backrunProxyLoss(
  victim: ParsedSwap,
  frontRun: ParsedSwap,
  backRun: ParsedSwap,
  jitoTipLamports: bigint,
): LossCalculation {
  let proxyProfit = backRun.outputAmount - frontRun.inputAmount;
  // If the tip is paid in SOL and the bot's profit denomination is also
  // SOL (common: WSOL/MEME pairs), subtract it from the realized profit.
  if (jitoTipLamports > 0n && frontRun.inputMint === SOL_MINT) {
    proxyProfit -= jitoTipLamports;
  }
  if (proxyProfit < 0n) proxyProfit = 0n;

  // lossInOutputToken ≈ proxyProfit * (victimOut / victimIn).
  // Guard against zero-input victim swaps to avoid division by zero —
  // such swaps shouldn't reach the detector, but defensive coding keeps
  // a single bad fixture from crashing the worker.
  const lossInOutputToken =
    victim.inputAmount === 0n
      ? 0n
      : (proxyProfit * victim.outputAmount) / victim.inputAmount;

  return {
    method: "backrun-profit-proxy",
    actualOutput: victim.outputAmount,
    counterfactualOutput: victim.outputAmount + lossInOutputToken,
    lossInOutputToken,
    lossUsd: null,
    lossConfidence: 0.85,
  };
}

/**
 * Failed back-run slippage estimate. The back-run reverted (or sold less
 * than expected), so the bot lost money — but the victim still suffered
 * the front-run's slippage.
 *
 * We don't have the pre-front-run mid price (would need an oracle or pool
 * reserves we don't have). Approximation: compare the front-run's implied
 * exchange rate to the victim's implied rate. If the front-run got a
 * better rate than the victim (which is the whole point of front-running),
 * the rate delta is roughly the slippage the victim ate.
 *
 * Tagged confidence 0.50 — this is a rough estimate. The UI should show
 * "estimated loss" rather than presenting it as exact.
 */
export function failedBackrunLoss(
  victim: ParsedSwap,
  frontRun: ParsedSwap,
): LossCalculation {
  // Use floats here only because the result is acknowledged as an
  // estimate. We don't need full bigint precision for a 50%-confidence
  // number — but we still convert back to bigint for the canonical
  // output unit.
  const frontIn = Number(frontRun.inputAmount);
  const frontOut = Number(frontRun.outputAmount);
  const victimIn = Number(victim.inputAmount);
  const victimOut = Number(victim.outputAmount);

  if (frontIn <= 0 || victimIn <= 0) {
    return zeroLoss(victim, "failed-backrun-slippage", 0.5);
  }

  const frontRate = frontOut / frontIn;
  const victimRate = victimOut / victimIn;
  // Rate delta in output-per-input. Positive when victim got a worse
  // rate than the front-run (the typical sandwich shape).
  const rateDelta = frontRate - victimRate;
  if (rateDelta <= 0) {
    return zeroLoss(victim, "failed-backrun-slippage", 0.5);
  }

  const estimatedLossFloat = victimIn * rateDelta;
  // Math.floor to round down — we'd rather under-report than over-report
  // an estimated loss.
  const lossInOutputToken = BigInt(Math.max(0, Math.floor(estimatedLossFloat)));

  return {
    method: "failed-backrun-slippage",
    actualOutput: victim.outputAmount,
    counterfactualOutput: victim.outputAmount + lossInOutputToken,
    lossInOutputToken,
    lossUsd: null,
    lossConfidence: 0.5,
  };
}

function zeroLoss(
  victim: ParsedSwap,
  method: LossCalculation["method"],
  lossConfidence: number,
): LossCalculation {
  // lossUsd: null (not 0) — this means "we attempted loss calc but could not
  // compute a USD value", which Guard 2a (lossUsd < $0.01 → drop) skips.
  // Setting lossUsd: 0 here was silently dropping real sandwich detections
  // whenever the loss math failed (e.g. rate-delta sign reversal from noisy
  // bot-tx amount reconstruction, or mint mismatch in CPMM fallback).
  // lossInOutputToken: 0n is kept so Guard 2b (< 0.1% ratio) still fires —
  // that guard separately filters truly negligible detections where we DID
  // compute the loss but the number is near-zero.
  return {
    method,
    actualOutput: victim.outputAmount,
    counterfactualOutput: victim.outputAmount,
    lossInOutputToken: 0n,
    lossUsd: null,
    lossConfidence,
  };
}
