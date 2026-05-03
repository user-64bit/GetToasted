import { describe, it, expect } from "vitest";
import {
  backrunProxyLoss,
  computeLoss,
  failedBackrunLoss,
  reconstructCpmmLoss,
} from "./detector-loss.js";
import type { LayerMatch } from "./detector-types.js";
import type { ParsedSwap, PoolReserves } from "./types.js";

const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function mkSwap(overrides: Partial<ParsedSwap>): ParsedSwap {
  return {
    signature: "sig",
    slot: 100n,
    txIndexInBlock: 0,
    blockTime: new Date("2026-01-01T00:00:00Z"),
    signer: "X",
    pool: "POOL1",
    programId: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
    dex: "raydium_amm_v4",
    inputMint: USDC,
    outputMint: SOL,
    inputAmount: 1_000_000_000n,
    outputAmount: 5_000_000n,
    jitoTipLamports: null,
    jitoBundled: false,
    inputDecimals: 6,
    outputDecimals: 9,
    failed: false,
    ...overrides,
  };
}

describe("reconstructCpmmLoss", () => {
  it("computes counterfactual via x·y=k with 25 bps fee, returns positive loss when sandwiched", () => {
    // Realistic pool: 1M USDC and 5,000 SOL. Trade size << reserves so
    // the slippage is small (the front-run is what makes the victim's
    // output deviate from the counterfactual — not the victim's own size).
    const reserves: PoolReserves = {
      tokenA: 1_000_000_000_000n, // 1,000,000 USDC at 6 decimals
      tokenB: 5_000_000_000_000n, // 5,000 SOL at 9 decimals
      tokenAMint: USDC,
      tokenBMint: SOL,
    };

    // Victim sells 1,000 USDC. Without a front-run:
    //   feeAdjusted = 1_000_000_000 * 9975 / 10000 = 997_500_000
    //   newX = 1_000_000_000_000 + 997_500_000 = 1_000_997_500_000
    //   k = 5e24, newY = k / newX ≈ 4_995_017_543_859
    //   counterfactualOut = 5e12 - 4_995_017_543_859 ≈ 4_982_456_140 (~4.98 SOL)
    // The actual victim got ~4.95 SOL after being sandwiched.
    const victim = mkSwap({
      inputAmount: 1_000_000_000n,
      outputAmount: 4_950_000_000n, // 4.95 SOL — sandwiched
    });

    const loss = reconstructCpmmLoss(victim, reserves, "raydium_amm_v4");
    expect(loss.method).toBe("cpmm-reconstruction");
    expect(loss.lossConfidence).toBe(1.0);
    expect(loss.counterfactualOutput).toBeGreaterThan(victim.outputAmount);
    expect(loss.lossInOutputToken).toBeGreaterThan(0n);
    expect(loss.lossInOutputToken + victim.outputAmount).toBe(loss.counterfactualOutput);
  });

  it("returns proxy-shaped zero-loss when input mint doesn't match either reserve mint", () => {
    const reserves: PoolReserves = {
      tokenA: 10_000_000_000n,
      tokenB: 50_000_000_000n,
      tokenAMint: "MINT_A",
      tokenBMint: "MINT_B",
    };
    const victim = mkSwap({ inputMint: "DIFFERENT_MINT" });
    const loss = reconstructCpmmLoss(victim, reserves, "raydium_amm_v4");
    // Sentinel: lossConfidence=0 + method falls through, dispatcher will
    // re-route to backrun-profit-proxy when it sees that signal.
    expect(loss.lossConfidence).toBe(0);
    expect(loss.lossInOutputToken).toBe(0n);
  });

  it("clamps to zero loss when victim happened to get a better-than-counterfactual rate", () => {
    const reserves: PoolReserves = {
      tokenA: 10_000_000_000n,
      tokenB: 50_000_000_000n,
      tokenAMint: USDC,
      tokenBMint: SOL,
    };
    // Victim got more output than the no-front-run counterfactual
    // (synthetic case — wouldn't happen organically but defensive math).
    const victim = mkSwap({
      inputAmount: 1_000_000n,
      outputAmount: 100_000_000_000n, // absurdly large output
    });
    const loss = reconstructCpmmLoss(victim, reserves, "raydium_amm_v4");
    expect(loss.lossInOutputToken).toBe(0n);
  });
});

describe("backrunProxyLoss", () => {
  it("computes loss as proxyProfit converted to victim-output denomination", () => {
    const front = mkSwap({ inputAmount: 1_000_000_000n, outputAmount: 5_000_000n });
    const victim = mkSwap({ inputAmount: 500_000_000n, outputAmount: 2_400_000n });
    // Bot bought 5_000_000 SOL-units, sells back for 1_100_000_000 USDC-units.
    // proxyProfit = 1_100_000_000 - 1_000_000_000 = 100_000_000
    // loss in output (SOL) = 100_000_000 * 2_400_000 / 500_000_000 = 480_000
    const back = mkSwap({
      inputMint: SOL,
      outputMint: USDC,
      inputAmount: 5_000_000n,
      outputAmount: 1_100_000_000n,
    });
    const loss = backrunProxyLoss(victim, front, back, 0n);
    expect(loss.method).toBe("backrun-profit-proxy");
    expect(loss.lossInOutputToken).toBe(480_000n);
    expect(loss.lossConfidence).toBe(0.85);
  });

  it("subtracts Jito tip from proxy profit when victim input is SOL", () => {
    const front = mkSwap({
      inputMint: SOL,
      outputMint: USDC,
      inputAmount: 5_000_000_000n, // 5 SOL
      outputAmount: 1_000_000_000n, // 1000 USDC
    });
    const victim = mkSwap({
      inputMint: SOL,
      outputMint: USDC,
      inputAmount: 1_000_000_000n,
      outputAmount: 200_000_000n,
    });
    const back = mkSwap({
      inputMint: USDC,
      outputMint: SOL,
      inputAmount: 1_000_000_000n,
      outputAmount: 5_500_000_000n, // 5.5 SOL — 0.5 SOL profit pre-tip
    });
    // proxyProfit = 5_500_000_000 - 5_000_000_000 - 100_000_000 (tip) = 400_000_000
    // loss = 400_000_000 * victimOut / victimIn = 400_000_000 * 200_000_000 / 1_000_000_000 = 80_000_000
    const loss = backrunProxyLoss(victim, front, back, 100_000_000n);
    expect(loss.lossInOutputToken).toBe(80_000_000n);
  });

  it("clamps profit to zero when back.output < front.input + tip (failed extraction)", () => {
    const front = mkSwap({ inputAmount: 1_000_000_000n, outputAmount: 5_000_000n });
    const victim = mkSwap({ inputAmount: 500_000_000n, outputAmount: 2_400_000n });
    const back = mkSwap({
      inputMint: SOL,
      outputMint: USDC,
      inputAmount: 5_000_000n,
      outputAmount: 900_000_000n, // bot LOST money
    });
    const loss = backrunProxyLoss(victim, front, back, 0n);
    expect(loss.lossInOutputToken).toBe(0n);
  });
});

describe("failedBackrunLoss", () => {
  it("estimates slippage from front vs victim implied rate when front got a better fill", () => {
    const front = mkSwap({
      inputAmount: 1_000_000_000n,
      outputAmount: 5_000_000n, // rate: 0.005
    });
    const victim = mkSwap({
      inputAmount: 1_000_000_000n,
      outputAmount: 4_500_000n, // rate: 0.0045 (worse — got slipped)
    });
    const loss = failedBackrunLoss(victim, front);
    expect(loss.method).toBe("failed-backrun-slippage");
    expect(loss.lossConfidence).toBe(0.5);
    // Estimated loss: rate delta * victimIn = 0.0005 * 1_000_000_000 = 500_000
    expect(loss.lossInOutputToken).toBe(500_000n);
  });

  it("returns zero loss when victim's rate is better than the front-run's rate", () => {
    const front = mkSwap({ inputAmount: 1_000_000_000n, outputAmount: 4_000_000n });
    const victim = mkSwap({ inputAmount: 1_000_000_000n, outputAmount: 5_000_000n });
    const loss = failedBackrunLoss(victim, front);
    expect(loss.lossInOutputToken).toBe(0n);
  });

  it("returns zero loss with confidence 0.5 when inputs are zero (edge case)", () => {
    const front = mkSwap({ inputAmount: 0n, outputAmount: 5_000_000n });
    const victim = mkSwap({ inputAmount: 1_000_000_000n });
    const loss = failedBackrunLoss(victim, front);
    expect(loss.lossInOutputToken).toBe(0n);
    expect(loss.lossConfidence).toBe(0.5);
  });
});

describe("computeLoss dispatcher", () => {
  it("selects CPMM reconstruction when reserves are present and pool type is CPMM", () => {
    const reserves: PoolReserves = {
      tokenA: 10_000_000_000n,
      tokenB: 50_000_000_000n,
      tokenAMint: USDC,
      tokenBMint: SOL,
    };
    const front = mkSwap({
      inputAmount: 1_000_000_000n,
      outputAmount: 4_950_000n,
      poolReservesBefore: reserves,
    });
    const victim = mkSwap({ inputAmount: 500_000_000n, outputAmount: 2_400_000n });
    const back = mkSwap({
      inputMint: SOL,
      outputMint: USDC,
      inputAmount: 4_950_000n,
      outputAmount: 1_100_000_000n,
    });
    const match: LayerMatch = {
      victim,
      frontRun: front,
      backRun: back,
      attacker: front.signer,
      pool: "POOL1",
      layer: "L2",
      confidence: 0.95,
      status: "confirmed",
      jitoBundled: false,
      jitoTipLamports: 0n,
    };
    const loss = computeLoss(match);
    expect(loss.method).toBe("cpmm-reconstruction");
  });

  it("falls back to back-run profit proxy on CLMM pools (no CPMM reconstruction)", () => {
    const reserves: PoolReserves = {
      tokenA: 10_000_000_000n,
      tokenB: 50_000_000_000n,
      tokenAMint: USDC,
      tokenBMint: SOL,
    };
    const front = mkSwap({
      dex: "raydium_clmm", // CLMM — not eligible for reconstruction
      inputAmount: 1_000_000_000n,
      outputAmount: 4_950_000n,
      poolReservesBefore: reserves,
    });
    const victim = mkSwap({
      dex: "raydium_clmm",
      inputAmount: 500_000_000n,
      outputAmount: 2_400_000n,
    });
    const back = mkSwap({
      dex: "raydium_clmm",
      inputMint: SOL,
      outputMint: USDC,
      inputAmount: 4_950_000n,
      outputAmount: 1_100_000_000n,
    });
    const match: LayerMatch = {
      victim,
      frontRun: front,
      backRun: back,
      attacker: front.signer,
      pool: "POOL1",
      layer: "L2",
      confidence: 0.95,
      status: "confirmed",
      jitoBundled: false,
      jitoTipLamports: 0n,
    };
    const loss = computeLoss(match);
    expect(loss.method).toBe("backrun-profit-proxy");
  });

  it("uses failed-backrun method when the back-run reverted (regardless of pool type)", () => {
    const front = mkSwap({ inputAmount: 1_000_000_000n, outputAmount: 5_000_000n });
    const victim = mkSwap({ inputAmount: 1_000_000_000n, outputAmount: 4_500_000n });
    const back = mkSwap({
      inputMint: SOL,
      outputMint: USDC,
      inputAmount: 5_000_000n,
      outputAmount: 800_000_000n,
      failed: true,
    });
    const match: LayerMatch = {
      victim,
      frontRun: front,
      backRun: back,
      attacker: front.signer,
      pool: "POOL1",
      layer: "L2",
      confidence: 0.95,
      status: "confirmed",
      jitoBundled: false,
      jitoTipLamports: 0n,
    };
    const loss = computeLoss(match);
    expect(loss.method).toBe("failed-backrun-slippage");
  });
});
