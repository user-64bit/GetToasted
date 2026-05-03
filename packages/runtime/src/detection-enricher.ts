import { computeLossUsd, type SandwichDetection } from "@get-toasted/core";
import type { Sandwiches } from "@get-toasted/db";
import type { BlockTimeResolver } from "./block-time.js";
import type { DecimalsResolver } from "./decimals-cache.js";
import type { LeaderScheduleCache } from "./leader-schedule.js";
import type { PriceClient } from "./pricing-cache.js";

/**
 * Enrich a layered SandwichDetection into the row shape consumed by
 * Sandwiches.batchInsertDetections. Lives in @get-toasted/runtime so the
 * scanner (historical) and detector (realtime) workers share one source
 * of truth — drift between the two used to leave realtime detections
 * with hardcoded validatorVote, jitoBundled etc. (see backend
 * architecture memory, 2026-05-01 refactor).
 *
 * Responsibilities:
 *   - Resolve block time (defensive — usually already on the swap)
 *   - Resolve validator vote account from leader schedule
 *   - Resolve decimals for the loss output token
 *   - Denominate loss in USD via Jupiter Price API
 *   - Map the layered detection's loss method + confidence into the row
 *
 * The function is pure-ish: I/O is performed via injected resolvers.
 * Production wiring lives in each worker's bootstrap.
 */
export type EnricherDeps = {
  leader: LeaderScheduleCache;
  prices: PriceClient;
  decimals: DecimalsResolver;
  blockTime?: BlockTimeResolver;
};

export async function enrichSandwichDetection(
  detection: SandwichDetection,
  deps: EnricherDeps,
): Promise<Sandwiches.SandwichInsert> {
  const { victim, frontRun, backRun, loss, layer } = detection;

  // Block time should already be on the swap from Helius enhanced parse.
  // Guard against the (rare) case where it's epoch-zero or NaN — webhook
  // path can hit this when Helius is slightly behind the slot.
  let blockTime = victim.blockTime;
  if (
    deps.blockTime &&
    (Number.isNaN(blockTime.getTime()) || blockTime.getTime() === 0)
  ) {
    const fetched = await deps.blockTime.getBlockTime(victim.slot);
    if (fetched) blockTime = fetched;
  }

  const validatorVote = await deps.leader.getValidatorForSlot(victim.slot);

  // The loss is denominated in the victim's *output* token. Resolve its
  // decimals + USD price for that mint, not the input mint. Long-tail
  // memecoins commonly have no Jupiter price — we surface that as null
  // and store the raw output amount so the UI can render
  // "≈142 TOKEN (USD unknown)".
  const outputDecimals =
    victim.outputDecimals ||
    (await deps.decimals.getDecimals(victim.outputMint)) ||
    0;
  const priceUsd = await deps.prices.getTokenPriceUsd(victim.outputMint, blockTime);
  const lossUsd = computeLossUsd(loss.lossInOutputToken, outputDecimals, priceUsd);

  // Attacker profit is what the bot extracted — back.outputAmount minus
  // front.inputAmount, clamped at zero. Stored alongside loss so dashboards
  // can show "MEV extracted" separately from "victim loss" (they're not
  // identical when the bot pays a tip or has a partial back-run).
  const tipLamports = detection.jitoTipLamports;
  const attackerProfitRaw = computeAttackerProfit(detection, tipLamports);

  return {
    slot: victim.slot,
    blockTime,
    pool: detection.pool,
    dex: victim.dex,
    attacker: detection.attacker,
    victimWallet: victim.signer,
    validatorVote,
    frontSig: frontRun.signature,
    victimSig: victim.signature,
    backSig: backRun.signature,
    jitoBundled: detection.jitoBundled,
    jitoTipLamports: tipLamports > 0n ? tipLamports : null,
    inputMint: victim.inputMint,
    outputMint: victim.outputMint,
    victimInAmt: victim.inputAmount.toString(),
    victimOutAmt: victim.outputAmount.toString(),
    counterfactualOutAmt: loss.counterfactualOutput.toString(),
    attackerProfitRaw: attackerProfitRaw.toString(),
    lossUsd: lossUsd !== null ? lossUsd.toFixed(2) : null,
    lossOutputAmount: loss.lossInOutputToken.toString(),
    confidence: detection.confidence.toFixed(2),
    failed: backRun.failed,
    isKnownBot: false, // populated by L3+ once enabled
    knownBotName: null,
    detectionLayer: layer,
    lossMethod: loss.method,
    lossConfidence: loss.lossConfidence.toFixed(2),
  };
}

function computeAttackerProfit(
  detection: SandwichDetection,
  tipLamports: bigint,
): bigint {
  const { frontRun, backRun } = detection;
  if (backRun.failed) return 0n;
  let profit = backRun.outputAmount - frontRun.inputAmount;
  // Subtract tip only when the tip's denomination matches the profit
  // denomination (both in lamports / SOL base units).
  if (
    tipLamports > 0n &&
    frontRun.inputMint === "So11111111111111111111111111111111111111112"
  ) {
    profit -= tipLamports;
  }
  return profit > 0n ? profit : 0n;
}
