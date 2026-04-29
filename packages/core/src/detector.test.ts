import { describe, it, expect } from "vitest";
import { detectSandwichesInSlot, type ParsedSwap } from "./detector.js";

const mkSwap = (overrides: Partial<ParsedSwap>): ParsedSwap => ({
  signature: "sig",
  slot: 100,
  txIndexInBlock: 0,
  signer: "X",
  pool: "POOL",
  programId: "PROG",
  inputMint: "USDC",
  outputMint: "SOL",
  inputAmount: 1000n,
  outputAmount: 5n,
  jitoBundled: false,
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
      inputMint: "SOL",
      outputMint: "USDC",
      inputAmount: 5n,
      outputAmount: 1100n,
    });
    const result = detectSandwichesInSlot([front, victim, back]);
    expect(result).toHaveLength(1);
    expect(result[0]!.attacker).toBe("ATTACKER");
    expect(result[0]!.victim).toBe("VICTIM");
    expect(result[0]!.attackerProfitRaw).toBe(100n);
  });

  it("ignores arbitrage on different pools", () => {
    const a1 = mkSwap({ signer: "ARB", txIndexInBlock: 0, pool: "P1" });
    const a2 = mkSwap({
      signer: "ARB",
      txIndexInBlock: 1,
      pool: "P2",
      inputMint: "SOL",
      outputMint: "USDC",
    });
    expect(detectSandwichesInSlot([a1, a2])).toHaveLength(0);
  });

  it("ignores when front and back share signer with victim", () => {
    const a = mkSwap({ signer: "X", txIndexInBlock: 0 });
    const b = mkSwap({ signer: "X", txIndexInBlock: 1 });
    const c = mkSwap({
      signer: "X",
      txIndexInBlock: 2,
      inputMint: "SOL",
      outputMint: "USDC",
    });
    expect(detectSandwichesInSlot([a, b, c])).toHaveLength(0);
  });
});
