import { describe, it, expect } from "vitest";
import { extractJitoTipLamports, parseHeliusTxToSwaps } from "./parser.js";
import type { HeliusEnhancedTransaction } from "./client.js";

const RAYDIUM_AMM_V4 = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TIP_ACC = "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5";

// Expected synthetic pool keys — direction-invariant, mint-pair-aware.
// `${programId}:${[mintA, mintB].sort().join("-")}`
const RAYDIUM_USDC_SOL_POOL = `${RAYDIUM_AMM_V4}:${USDC}-${SOL}`;

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
    expect(s.pool).toBe(RAYDIUM_USDC_SOL_POOL);
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

  it("parses non-SWAP type when a tracked DEX instruction is present (Helius mislabels many real swaps as TRANSFER/UNKNOWN)", () => {
    const tx = baseTx({
      type: "TRANSFER",
      feePayer: "VICTIM",
      instructions: [
        {
          programId: RAYDIUM_AMM_V4,
          accounts: [RAYDIUM_AMM_V4, "POOL_ACC"],
          data: "",
          innerInstructions: [],
        },
      ],
      // No `events.swap` — forces the balance-delta reconstruction path.
      events: {},
      accountData: [
        {
          account: "VICTIM_USDC_ATA",
          tokenBalanceChanges: [
            {
              userAccount: "VICTIM",
              mint: USDC,
              rawTokenAmount: { tokenAmount: "-1000000000", decimals: 6 },
            },
          ],
        },
        {
          account: "VICTIM_SOL_ATA",
          tokenBalanceChanges: [
            {
              userAccount: "VICTIM",
              mint: SOL,
              rawTokenAmount: { tokenAmount: "5000000", decimals: 9 },
            },
          ],
        },
      ],
    });
    const swaps = parseHeliusTxToSwaps(tx);
    expect(swaps).toHaveLength(1);
    expect(swaps[0]!.dex).toBe("raydium_amm_v4");
    expect(swaps[0]!.inputMint).toBe(USDC);
    expect(swaps[0]!.outputMint).toBe(SOL);
    expect(swaps[0]!.inputAmount).toBe(1_000_000_000n);
    expect(swaps[0]!.outputAmount).toBe(5_000_000n);
    expect(swaps[0]!.signer).toBe("VICTIM");
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

describe("parseHeliusTxToSwaps — accountData fallback (empty events.swap)", () => {
  // Reproduces the Meteora DAMM v2 / Pump pattern where Helius classifies
  // the tx as SWAP but leaves `events.swap` empty (or absent). Without the
  // accountData fallback, every such tx was silently dropped by the parser
  // — which is the actual reason wallets that *had* swaps were showing
  // up with zero parsed activity, hiding any sandwiches against them.
  it("reconstructs ParsedSwap from accountData tokenBalanceChanges", () => {
    const tx = baseTx({
      type: "SWAP",
      source: "METEORA_DAMM_V2",
      events: { swap: {} },
      instructions: [
        {
          programId: "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG",
          accounts: ["cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG", "POOL_ACC_M"],
          data: "",
          innerInstructions: [],
        },
      ],
      accountData: [
        {
          account: "WSOL_TOKEN_ACCOUNT",
          tokenBalanceChanges: [
            {
              userAccount: "ATTACKER",
              tokenAccount: "WSOL_TOKEN_ACCOUNT",
              mint: SOL,
              rawTokenAmount: { tokenAmount: "-60000", decimals: 9 },
            },
          ],
        },
        {
          account: "TOKEN_ACCOUNT_OUT",
          tokenBalanceChanges: [
            {
              userAccount: "ATTACKER",
              tokenAccount: "TOKEN_ACCOUNT_OUT",
              mint: USDC,
              rawTokenAmount: { tokenAmount: "31543486923", decimals: 6 },
            },
          ],
        },
      ],
    });

    const swaps = parseHeliusTxToSwaps(tx);
    expect(swaps).toHaveLength(1);
    expect(swaps[0]!.dex).toBe("meteora_damm_v2");
    expect(swaps[0]!.inputMint).toBe(SOL);
    expect(swaps[0]!.outputMint).toBe(USDC);
    expect(swaps[0]!.inputAmount).toBe(60_000n);
    expect(swaps[0]!.outputAmount).toBe(31_543_486_923n);
  });

  // Pump.fun and many other DEXes route the SOL leg via plain native
  // transfers (no wrapped-SOL token account). Reconstruction must pick
  // those up via `nativeTransfers` so we don't silently drop ~80% of
  // pump-routed swaps.
  it("falls back to nativeTransfers for the SOL leg, excluding Jito tips", () => {
    const tx = baseTx({
      type: "SWAP",
      source: "PUMP_FUN",
      events: { swap: {} },
      instructions: [
        {
          programId: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
          accounts: ["6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P", "PUMP_POOL"],
          data: "",
          innerInstructions: [],
        },
      ],
      nativeTransfers: [
        // Real swap input — wallet → bonding-curve account.
        { fromUserAccount: "ATTACKER", toUserAccount: "BONDING_CURVE", amount: 50_000_000 },
        // Jito tip — must NOT be counted as part of swap input.
        { fromUserAccount: "ATTACKER", toUserAccount: TIP_ACC, amount: 10_000 },
      ],
      accountData: [
        {
          account: "OUT_TOKEN_ACCOUNT",
          tokenBalanceChanges: [
            {
              userAccount: "ATTACKER",
              tokenAccount: "OUT_TOKEN_ACCOUNT",
              mint: USDC,
              rawTokenAmount: { tokenAmount: "237687749190", decimals: 6 },
            },
          ],
        },
      ],
    });

    const swaps = parseHeliusTxToSwaps(tx);
    expect(swaps).toHaveLength(1);
    expect(swaps[0]!.inputMint).toBe(SOL);
    expect(swaps[0]!.inputAmount).toBe(50_000_000n); // tip excluded
    expect(swaps[0]!.outputMint).toBe(USDC);
    expect(swaps[0]!.outputAmount).toBe(237_687_749_190n);
  });

  // legToSwap used to crash on legs missing rawTokenAmount — one bad leg
  // killed the whole tx parse, including any well-formed sibling legs
  // and the single-hop fallback.
  it("does not crash on Jupiter inner legs missing rawTokenAmount", () => {
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
              // @ts-expect-error — deliberately malformed leg
              tokenInputs: [{ userAccount: "X", mint: USDC }],
              // @ts-expect-error — deliberately malformed leg
              tokenOutputs: [{ userAccount: "X", mint: SOL }],
            },
          ],
        },
      },
      instructions: [
        {
          programId: RAYDIUM_AMM_V4,
          accounts: [RAYDIUM_AMM_V4, "POOL_ACC"],
          data: "",
          innerInstructions: [],
        },
      ],
      accountData: [
        {
          account: "ACC1",
          tokenBalanceChanges: [
            {
              userAccount: "ATTACKER",
              tokenAccount: "ACC1",
              mint: USDC,
              rawTokenAmount: { tokenAmount: "-1000000", decimals: 6 },
            },
            {
              userAccount: "ATTACKER",
              tokenAccount: "ACC1",
              mint: SOL,
              rawTokenAmount: { tokenAmount: "5000", decimals: 9 },
            },
          ],
        },
      ],
    });

    // Should not throw, and should fall through to single-hop reconstruction.
    expect(() => parseHeliusTxToSwaps(tx)).not.toThrow();
    const swaps = parseHeliusTxToSwaps(tx);
    expect(swaps).toHaveLength(1);
    expect(swaps[0]!.inputMint).toBe(USDC);
    expect(swaps[0]!.outputMint).toBe(SOL);
  });
});

describe("pool-key consistency across parsing paths", () => {
  // This is the regression that hid sandwiches against any wallet that
  // used Jupiter (i.e. most retail traders). The bot's direct-swap front
  // and back parsed via the single-hop path; the victim's Jupiter-routed
  // swap parsed via the inner-swap path. Each path produced a different
  // `pool` string for the same physical pool, so the orchestrator's
  // `pool === victim.pool` filter rejected the bot's swaps and L2 had
  // no candidates. Pinning equivalence here so it can't regress.
  it("Jupiter-leg path and direct-swap path produce the SAME pool key for the same physical pool", () => {
    // Bot's front-run — direct Raydium AMM v4 swap, accounts list has
    // tokenProgram first (real Helius layout).
    const directTx = baseTx({
      signature: "front_sig",
      feePayer: "BOT",
      instructions: [
        {
          programId: RAYDIUM_AMM_V4,
          accounts: [
            "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", // tokenProgram
            "REAL_AMM_ID", // the actual pool
            "REAL_AMM_AUTH",
          ],
          data: "",
          innerInstructions: [],
        },
      ],
      events: {
        swap: {
          tokenInputs: [
            { userAccount: "BOT", mint: USDC, rawTokenAmount: { tokenAmount: "1000000000", decimals: 6 } },
          ],
          tokenOutputs: [
            { userAccount: "BOT", mint: SOL, rawTokenAmount: { tokenAmount: "5000000", decimals: 9 } },
          ],
        },
      },
    });

    // Victim's swap — routed via Jupiter, leg through Raydium AMM v4.
    // Helius enhanced returns programInfo.account = the leg's program
    // id, NOT the AMM id; we have to derive the pool key from
    // (programId, mints) instead.
    const jupiterTx = baseTx({
      signature: "victim_sig",
      feePayer: "VICTIM",
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
                { userAccount: "VICTIM", mint: USDC, rawTokenAmount: { tokenAmount: "500000000", decimals: 6 } },
              ],
              tokenOutputs: [
                { userAccount: "VICTIM", mint: SOL, rawTokenAmount: { tokenAmount: "2400000", decimals: 9 } },
              ],
            },
          ],
        },
      },
    });

    const direct = parseHeliusTxToSwaps(directTx);
    const jupiter = parseHeliusTxToSwaps(jupiterTx);

    expect(direct).toHaveLength(1);
    expect(jupiter).toHaveLength(1);
    expect(direct[0]!.pool).toBe(jupiter[0]!.pool);
    expect(direct[0]!.pool).toBe(RAYDIUM_USDC_SOL_POOL);
  });

  it("produces a direction-invariant key (USDC→SOL and SOL→USDC map to the same pool)", () => {
    const buyTx = baseTx({
      signature: "buy",
      instructions: [
        {
          programId: RAYDIUM_AMM_V4,
          accounts: [RAYDIUM_AMM_V4, "AMM"],
          data: "",
          innerInstructions: [],
        },
      ],
      events: {
        swap: {
          tokenInputs: [
            { userAccount: "X", mint: USDC, rawTokenAmount: { tokenAmount: "1000000", decimals: 6 } },
          ],
          tokenOutputs: [
            { userAccount: "X", mint: SOL, rawTokenAmount: { tokenAmount: "5000", decimals: 9 } },
          ],
        },
      },
    });
    const sellTx = baseTx({
      signature: "sell",
      instructions: [
        {
          programId: RAYDIUM_AMM_V4,
          accounts: [RAYDIUM_AMM_V4, "AMM"],
          data: "",
          innerInstructions: [],
        },
      ],
      events: {
        swap: {
          tokenInputs: [
            { userAccount: "X", mint: SOL, rawTokenAmount: { tokenAmount: "5000", decimals: 9 } },
          ],
          tokenOutputs: [
            { userAccount: "X", mint: USDC, rawTokenAmount: { tokenAmount: "1100000", decimals: 6 } },
          ],
        },
      },
    });
    const buy = parseHeliusTxToSwaps(buyTx);
    const sell = parseHeliusTxToSwaps(sellTx);
    expect(buy[0]!.pool).toBe(sell[0]!.pool);
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
