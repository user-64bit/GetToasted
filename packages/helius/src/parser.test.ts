import { describe, it, expect } from "vitest";
import { extractJitoTipLamports, parseHeliusTxToSwaps } from "./parser.js";
import type { HeliusEnhancedTransaction } from "./client.js";

const RAYDIUM_AMM_V4 = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TIP_ACC = "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5";

const baseTx = (overrides: Partial<HeliusEnhancedTransaction> = {}): HeliusEnhancedTransaction => ({
  signature: "sig1",
  slot: 100,
  timestamp: 1_700_000_000,
  feePayer: "ATTACKER",
  type: "SWAP",
  source: "RAYDIUM",
  fee: 5000,
  tokenTransfers: [],
  nativeTransfers: [],
  events: {},
  instructions: [],
  transactionError: null,
  ...overrides,
});

describe("extractJitoTipLamports", () => {
  it("returns null when no tip transfer present", () => {
    expect(extractJitoTipLamports(baseTx())).toBeNull();
  });

  it("sums all transfers to known tip accounts", () => {
    const tx = baseTx({
      nativeTransfers: [
        { fromUserAccount: "X", toUserAccount: TIP_ACC, amount: 10_000 },
        { fromUserAccount: "X", toUserAccount: "OTHER", amount: 999_999 },
        { fromUserAccount: "X", toUserAccount: TIP_ACC, amount: 5_000 },
      ],
    });
    expect(extractJitoTipLamports(tx)).toBe(15_000n);
  });
});

describe("parseHeliusTxToSwaps — single hop Raydium", () => {
  it("emits one ParsedSwap with mints, amounts, decimals, jito flags", () => {
    const tx = baseTx({
      instructions: [
        {
          programId: RAYDIUM_AMM_V4,
          accounts: [RAYDIUM_AMM_V4, "POOL_ACC"],
          data: "",
          innerInstructions: [],
        },
      ],
      events: {
        swap: {
          tokenInputs: [
            {
              userAccount: "ATTACKER",
              mint: USDC,
              rawTokenAmount: { tokenAmount: "1000000000", decimals: 6 },
            },
          ],
          tokenOutputs: [
            {
              userAccount: "ATTACKER",
              mint: SOL,
              rawTokenAmount: { tokenAmount: "5000000", decimals: 9 },
            },
          ],
        },
      },
      nativeTransfers: [
        { fromUserAccount: "ATTACKER", toUserAccount: TIP_ACC, amount: 10_000 },
      ],
    });

    const swaps = parseHeliusTxToSwaps(tx, { txIndexInBlock: 7 });
    expect(swaps).toHaveLength(1);
    const s = swaps[0]!;
    expect(s.dex).toBe("raydium_amm_v4");
    expect(s.programId).toBe(RAYDIUM_AMM_V4);
    expect(s.pool).toBe("POOL_ACC");
    expect(s.inputMint).toBe(USDC);
    expect(s.outputMint).toBe(SOL);
    expect(s.inputAmount).toBe(1_000_000_000n);
    expect(s.outputAmount).toBe(5_000_000n);
    expect(s.inputDecimals).toBe(6);
    expect(s.outputDecimals).toBe(9);
    expect(s.jitoBundled).toBe(true);
    expect(s.jitoTipLamports).toBe(10_000n);
    expect(s.txIndexInBlock).toBe(7);
    expect(s.failed).toBe(false);
    expect(s.signer).toBe("ATTACKER");
  });

  it("returns empty for non-SWAP type", () => {
    expect(parseHeliusTxToSwaps(baseTx({ type: "TRANSFER" }))).toEqual([]);
  });

  it("returns empty when no tracked DEX is touched", () => {
    const tx = baseTx({
      instructions: [
        {
          programId: "UnknownProgram111111111111111111111111111111",
          accounts: [],
          data: "",
          innerInstructions: [],
        },
      ],
      events: { swap: {} },
    });
    expect(parseHeliusTxToSwaps(tx)).toEqual([]);
  });

  it("flags failed transactions", () => {
    const tx = baseTx({
      transactionError: { InstructionError: [0, "Custom"] },
      instructions: [
        {
          programId: RAYDIUM_AMM_V4,
          accounts: [RAYDIUM_AMM_V4, "POOL_ACC"],
          data: "",
          innerInstructions: [],
        },
      ],
      events: {
        swap: {
          tokenInputs: [
            {
              userAccount: "X",
              mint: USDC,
              rawTokenAmount: { tokenAmount: "1000", decimals: 6 },
            },
          ],
          tokenOutputs: [
            {
              userAccount: "X",
              mint: SOL,
              rawTokenAmount: { tokenAmount: "1", decimals: 9 },
            },
          ],
        },
      },
    });
    const swaps = parseHeliusTxToSwaps(tx);
    expect(swaps[0]!.failed).toBe(true);
  });
});

describe("parseHeliusTxToSwaps — multi-leg Jupiter route", () => {
  it("emits one ParsedSwap per tracked inner swap", () => {
    const tx = baseTx({
      events: {
        swap: {
          innerSwaps: [
            {
              programInfo: {
                source: "RAYDIUM",
                account: RAYDIUM_AMM_V4,
                programName: "Raydium AMM v4",
                instructionName: "swap",
              },
              tokenInputs: [
                {
                  userAccount: "X",
                  mint: USDC,
                  rawTokenAmount: { tokenAmount: "100", decimals: 6 },
                },
              ],
              tokenOutputs: [
                {
                  userAccount: "X",
                  mint: SOL,
                  rawTokenAmount: { tokenAmount: "1", decimals: 9 },
                },
              ],
            },
            {
              programInfo: {
                source: "UNKNOWN",
                account: "ZZZuntracked",
                programName: "Untracked",
                instructionName: "swap",
              },
              tokenInputs: [
                {
                  userAccount: "X",
                  mint: USDC,
                  rawTokenAmount: { tokenAmount: "1", decimals: 6 },
                },
              ],
              tokenOutputs: [
                {
                  userAccount: "X",
                  mint: SOL,
                  rawTokenAmount: { tokenAmount: "1", decimals: 9 },
                },
              ],
            },
          ],
        },
      },
    });
    const swaps = parseHeliusTxToSwaps(tx);
    expect(swaps).toHaveLength(1);
    expect(swaps[0]!.dex).toBe("raydium_amm_v4");
  });
});
