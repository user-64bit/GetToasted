import { describe, it, expect } from "vitest";
import {
  detectSandwichesInSlot,
  scoreSandwich,
  type ParsedSwap,
  type SandwichCandidate,
} from "./detector.js";
import { computeLossUsd } from "./pricing.js";

const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const mkSwap = (overrides: Partial<ParsedSwap>): ParsedSwap => ({
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
});

describe("detectSandwichesInSlot", () => {
  it("detects a textbook A-B-A sandwich", () => {
    const front = mkSwap({ signer: "ATTACKER", txIndexInBlock: 0, signature: "f" });
    const victim = mkSwap({ signer: "VICTIM", txIndexInBlock: 1, signature: "v" });
    const back = mkSwap({
      signer: "ATTACKER",
      txIndexInBlock: 2,
      signature: "b",
      inputMint: SOL,
      outputMint: USDC,
      inputAmount: 5_000_000n,
      outputAmount: 1_100_000_000n,
    });

    const result = detectSandwichesInSlot([front, victim, back]);
    expect(result).toHaveLength(1);
    expect(result[0]!.candidate.front.signer).toBe("ATTACKER");
    expect(result[0]!.candidate.victim.signer).toBe("VICTIM");
    expect(result[0]!.attackerProfitRaw).toBe(100_000_000n);
    expect(result[0]!.failed).toBe(false);
    expect(result[0]!.confidenceScore).toBeGreaterThan(0.5);
  });

  it("ignores arbitrage on different pools", () => {
    const a1 = mkSwap({ signer: "ARB", txIndexInBlock: 0, pool: "P1" });
    const a2 = mkSwap({
      signer: "ARB",
      txIndexInBlock: 1,
      pool: "P2",
      inputMint: SOL,
      outputMint: USDC,
    });
    expect(detectSandwichesInSlot([a1, a2])).toHaveLength(0);
  });

  it("ignores when victim shares signer with attacker", () => {
    const a = mkSwap({ signer: "X", txIndexInBlock: 0 });
    const b = mkSwap({ signer: "X", txIndexInBlock: 1 });
    const c = mkSwap({
      signer: "X",
      txIndexInBlock: 2,
      inputMint: SOL,
      outputMint: USDC,
    });
    expect(detectSandwichesInSlot([a, b, c])).toHaveLength(0);
  });

  it("filters out dust front-run amounts", () => {
    const front = mkSwap({
      signer: "ATTACKER",
      txIndexInBlock: 0,
      signature: "f",
      inputAmount: 100n,
    });
    const victim = mkSwap({ signer: "VICTIM", txIndexInBlock: 1 });
    const back = mkSwap({
      signer: "ATTACKER",
      txIndexInBlock: 2,
      signature: "b",
      inputMint: SOL,
      outputMint: USDC,
    });
    expect(detectSandwichesInSlot([front, victim, back])).toHaveLength(0);
  });

  it("rejects when back tx pool differs from front pool", () => {
    const front = mkSwap({ signer: "A", txIndexInBlock: 0, pool: "P1" });
    const victim = mkSwap({ signer: "V", txIndexInBlock: 1, pool: "P1" });
    const back = mkSwap({
      signer: "A",
      txIndexInBlock: 2,
      pool: "P1",
      inputMint: SOL,
      outputMint: USDC,
    });
    expect(detectSandwichesInSlot([front, victim, back])).toHaveLength(1);

    const backWrongPool = mkSwap({
      signer: "A",
      txIndexInBlock: 2,
      pool: "P2",
      inputMint: SOL,
      outputMint: USDC,
    });
    expect(detectSandwichesInSlot([front, victim, backWrongPool])).toHaveLength(0);
  });
});

describe("scoreSandwich", () => {
  const mkCandidate = (overrides: {
    failed?: boolean;
    bundled?: boolean;
    bot?: boolean;
  }): SandwichCandidate => {
    const front = mkSwap({
      signer: overrides.bot ? "9973hWbcumZNeKd4UxW1wT892rcdHQNwjfnz8KwzyWp6" : "A",
      txIndexInBlock: 0,
      jitoBundled: overrides.bundled ?? false,
      jitoTipLamports: overrides.bundled ? 10_000n : null,
    });
    const victim = mkSwap({ signer: "V", txIndexInBlock: 1 });
    const back = mkSwap({
      signer: front.signer,
      txIndexInBlock: 2,
      inputMint: SOL,
      outputMint: USDC,
      inputAmount: 5_000_000n,
      outputAmount: 1_100_000_000n,
      failed: overrides.failed ?? false,
      jitoBundled: overrides.bundled ?? false,
    });
    return { front, victim, back, pool: front.pool, slot: front.slot };
  };

  it("base confidence for vanilla onchain sandwich is 0.70", () => {
    const det = scoreSandwich(mkCandidate({}), null);
    expect(det.confidenceScore).toBe(0.7);
  });

  it("adds +0.20 for jito-bundled, +0.10 for known bot", () => {
    const det = scoreSandwich(mkCandidate({ bundled: true, bot: true }), "VOTE");
    expect(det.confidenceScore).toBeCloseTo(1.0, 2);
    expect(det.isKnownBot).toBe(true);
    expect(det.knownBotName).toBe("arsc-cold");
    expect(det.validatorVoteAccount).toBe("VOTE");
  });

  it("zeroes profit and reduces confidence for failed back", () => {
    const det = scoreSandwich(mkCandidate({ failed: true }), null);
    expect(det.attackerProfitRaw).toBe(0n);
    expect(det.failed).toBe(true);
    expect(det.confidenceScore).toBeLessThan(0.7);
  });

  it("subtracts jito tip from realized profit", () => {
    const det = scoreSandwich(mkCandidate({ bundled: true }), null);
    expect(det.attackerProfitRaw).toBe(1_100_000_000n - 1_000_000_000n - 10_000n);
  });
});

describe("computeLossUsd", () => {
  it("returns null when no price available", () => {
    expect(computeLossUsd(1_000_000n, 6, null)).toBeNull();
  });

  it("returns 0 for non-positive losses", () => {
    expect(computeLossUsd(0n, 6, 1.0)).toBe(0);
    expect(computeLossUsd(-5n, 6, 1.0)).toBe(0);
  });

  it("rounds to cents", () => {
    expect(computeLossUsd(123_456_789n, 6, 1.0)).toBe(123.46);
  });
});
