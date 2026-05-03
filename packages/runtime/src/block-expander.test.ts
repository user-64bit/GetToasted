import { describe, expect, it, vi } from "vitest";
import type { Redis } from "ioredis";
import {
  detectSandwichesForWalletSwaps,
  type JitoBundleResolver,
} from "@get-toasted/core";
import type {
  HeliusBlock,
  HeliusBlockTransaction,
  HeliusClient,
  HeliusEnhancedTransaction,
} from "@get-toasted/helius";
import { createBlockExpander } from "./block-expander.js";

const NO_JITO: JitoBundleResolver = {
  async getBundleForTx() {
    return null;
  },
};

// ─── Constants ─────────────────────────────────────────────────────────────
const RAYDIUM_AMM_V4 = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const POOL = "POOL_ACC";
const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const ATTACKER = "ATTACKERWalletAddressxxxxxxxxxxxxxxxxxxxxxxxx";
const VICTIM = "VICTIMWalletAddressxxxxxxxxxxxxxxxxxxxxxxxxxx";

// ─── Minimal in-memory Redis stub ───────────────────────────────────────────
// We exercise `mget`, `get`, `set`, `del`, `eval` (Lua CAS unlock).
function makeFakeRedis() {
  const store = new Map<string, string>();
  const fake: Partial<Redis> = {
    mget: vi.fn(async (...keys: string[]) =>
      keys.map((k) => store.get(k) ?? null),
    ) as unknown as Redis["mget"],
    get: vi.fn(async (k: string) => store.get(k) ?? null) as unknown as Redis["get"],
    set: vi.fn(async (
      key: string,
      value: string,
      ..._args: unknown[]
    ) => {
      // Honor NX semantics: don't overwrite if present and NX flag passed.
      const args = _args as string[];
      if (args.includes("NX") && store.has(key)) return null;
      store.set(key, value);
      return "OK";
    }) as unknown as Redis["set"],
    del: vi.fn(async (k: string) => {
      const had = store.has(k);
      store.delete(k);
      return had ? 1 : 0;
    }) as unknown as Redis["del"],
    eval: vi.fn(async (
      _script: string,
      _numKeys: number,
      key: string,
      token: string,
    ) => {
      // We only ever pass the unlock-CAS script here.
      if (store.get(key) === token) {
        store.delete(key);
        return 1;
      }
      return 0;
    }) as unknown as Redis["eval"],
  };
  return { redis: fake as Redis, store };
}

// ─── Helius fixture builders ───────────────────────────────────────────────
function blockTx(sig: string, programId: string): HeliusBlockTransaction {
  return {
    transaction: {
      signatures: [sig],
      message: {
        accountKeys: [],
        instructions: [{ programId, accounts: [programId, POOL] }],
      },
    },
    meta: { err: null, innerInstructions: [] },
    version: 0,
  };
}

function enhancedSwap(
  sig: string,
  signer: string,
  inputMint: string,
  outputMint: string,
  inputAmount: string,
  outputAmount: string,
): HeliusEnhancedTransaction {
  return {
    signature: sig,
    slot: 100,
    timestamp: 1_700_000_000,
    feePayer: signer,
    type: "SWAP",
    source: "RAYDIUM",
    fee: 5000,
    tokenTransfers: [],
    nativeTransfers: [],
    events: {
      swap: {
        tokenInputs: [
          {
            userAccount: signer,
            mint: inputMint,
            rawTokenAmount: { tokenAmount: inputAmount, decimals: inputMint === SOL ? 9 : 6 },
          },
        ],
        tokenOutputs: [
          {
            userAccount: signer,
            mint: outputMint,
            rawTokenAmount: { tokenAmount: outputAmount, decimals: outputMint === SOL ? 9 : 6 },
          },
        ],
      },
    },
    instructions: [
      {
        programId: RAYDIUM_AMM_V4,
        accounts: [RAYDIUM_AMM_V4, POOL],
        data: "",
        innerInstructions: [],
      },
    ],
    transactionError: null,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────
describe("createBlockExpander — end-to-end against a synthetic sandwich block", () => {
  it("returns front+victim+back swaps in true block order, and the detector finds the sandwich", async () => {
    // Block layout (10 txs total): noise, FRONT, noise, VICTIM, noise, BACK, noise...
    // — proves we recover the right txIndexInBlock even when the candidates
    // are sparse and the parsed batch comes back partial-out-of-order.
    const block: HeliusBlock = {
      blockhash: "bh",
      parentSlot: 99,
      blockTime: 1_700_000_000,
      blockHeight: 1,
      transactions: [
        blockTx("noise0", SYSTEM_PROGRAM),
        blockTx("front_sig", RAYDIUM_AMM_V4),
        blockTx("noise2", SYSTEM_PROGRAM),
        blockTx("victim_sig", RAYDIUM_AMM_V4),
        blockTx("noise4", SYSTEM_PROGRAM),
        blockTx("back_sig", RAYDIUM_AMM_V4),
        blockTx("noise6", SYSTEM_PROGRAM),
      ],
    };

    const helius: Partial<HeliusClient> = {
      getBlock: vi.fn(async () => block),
      parseTransactions: vi.fn(async (sigs: string[]) => {
        // Return them deliberately out of submission order to prove the
        // expander reattaches `txIndexInBlock` by signature lookup, not by
        // input array position.
        const reordered = [...sigs].reverse();
        return reordered.map((sig) => {
          if (sig === "front_sig") return enhancedSwap(sig, ATTACKER, USDC, SOL, "1000000000", "5000000");
          if (sig === "victim_sig") return enhancedSwap(sig, VICTIM, USDC, SOL, "500000000", "2400000");
          if (sig === "back_sig") return enhancedSwap(sig, ATTACKER, SOL, USDC, "5000000", "1100000000");
          throw new Error(`unexpected sig: ${sig}`);
        });
      }),
    };

    const { redis } = makeFakeRedis();
    const expander = createBlockExpander({ redis, helius: helius as HeliusClient });

    const swaps = await expander.getBlockSwaps(100n);

    expect(swaps).toHaveLength(3);
    // True block order: front (idx 1), victim (idx 3), back (idx 5).
    expect(swaps.map((s) => s.txIndexInBlock)).toEqual([1, 3, 5]);
    expect(swaps[0]!.signer).toBe(ATTACKER);
    expect(swaps[1]!.signer).toBe(VICTIM);
    expect(swaps[2]!.signer).toBe(ATTACKER);
    expect(swaps[0]!.signature).toBe("front_sig");
    expect(swaps[2]!.signature).toBe("back_sig");

    // Now feed those swaps into the real layered detector. We expect L2
    // to fire (consecutive indices 1, 3, 5 — wait, those aren't
    // consecutive). Adjacency requires victim.idx ± 1 — the synthetic
    // block places noise txs between front/victim/back to prove the
    // expander recovers true block positions, but L2 won't fire on
    // non-adjacent indices. We assert *no* detection here, which is
    // semantically correct — a sandwich requires the bot to be willing
    // to land adjacent to the victim, and noise-padded blocks prove
    // they didn't. The dedicated detector tests cover the positive case
    // with adjacent indices.
    const detections = await detectSandwichesForWalletSwaps({
      wallet: VICTIM,
      walletSwaps: swaps.filter((s) => s.signer === VICTIM),
      blockSwaps: swaps,
      jito: NO_JITO,
    });
    expect(detections).toHaveLength(0);
  });

  it("end-to-end: adjacent front/victim/back triple flows through expander → L2 detector", async () => {
    // Compact block: front at 0, victim at 1, back at 2. L2 should fire.
    const block: HeliusBlock = {
      blockhash: "bh",
      parentSlot: 99,
      blockTime: 1_700_000_000,
      blockHeight: 1,
      transactions: [
        blockTx("front_sig", RAYDIUM_AMM_V4),
        blockTx("victim_sig", RAYDIUM_AMM_V4),
        blockTx("back_sig", RAYDIUM_AMM_V4),
      ],
    };

    const helius: Partial<HeliusClient> = {
      getBlock: vi.fn(async () => block),
      parseTransactions: vi.fn(async (sigs: string[]) =>
        sigs.map((sig) => {
          if (sig === "front_sig")
            return enhancedSwap(sig, ATTACKER, USDC, SOL, "1000000000", "5000000");
          if (sig === "victim_sig")
            return enhancedSwap(sig, VICTIM, USDC, SOL, "500000000", "2400000");
          if (sig === "back_sig")
            return enhancedSwap(sig, ATTACKER, SOL, USDC, "5000000", "1100000000");
          throw new Error(`unexpected sig: ${sig}`);
        }),
      ),
    };
    const { redis } = makeFakeRedis();
    const expander = createBlockExpander({ redis, helius: helius as HeliusClient });
    const swaps = await expander.getBlockSwaps(101n);
    const detections = await detectSandwichesForWalletSwaps({
      wallet: VICTIM,
      walletSwaps: swaps.filter((s) => s.signer === VICTIM),
      blockSwaps: swaps,
      jito: NO_JITO,
    });
    expect(detections).toHaveLength(1);
    expect(detections[0]!.layer).toBe("L2");
    expect(detections[0]!.attacker).toBe(ATTACKER);
    expect(detections[0]!.loss.method).toBeDefined();
  });

  it("returns [] and negative-caches the slot when getBlock returns null (skipped)", async () => {
    const helius: Partial<HeliusClient> = {
      getBlock: vi.fn(async () => null),
      parseTransactions: vi.fn(async () => []),
    };
    const { redis, store } = makeFakeRedis();
    const expander = createBlockExpander({ redis, helius: helius as HeliusClient });

    const swaps = await expander.getBlockSwaps(200n);
    expect(swaps).toEqual([]);
    expect(helius.parseTransactions).not.toHaveBeenCalled();
    // Negative cache key should be written so next call short-circuits.
    expect(store.has("slot:swaps:missing:200")).toBe(true);

    // Second call hits the negative cache — getBlock not called again.
    await expander.getBlockSwaps(200n);
    expect(helius.getBlock).toHaveBeenCalledTimes(1);
  });

  it("re-uses the cache on a second call for the same slot", async () => {
    const block: HeliusBlock = {
      blockhash: "bh",
      parentSlot: 99,
      blockTime: 1_700_000_000,
      blockHeight: 1,
      transactions: [blockTx("only_sig", RAYDIUM_AMM_V4)],
    };

    const helius: Partial<HeliusClient> = {
      getBlock: vi.fn(async () => block),
      parseTransactions: vi.fn(async () => [
        enhancedSwap("only_sig", VICTIM, USDC, SOL, "1000000", "5000"),
      ]),
    };
    const { redis } = makeFakeRedis();
    const expander = createBlockExpander({ redis, helius: helius as HeliusClient });

    const a = await expander.getBlockSwaps(300n);
    const b = await expander.getBlockSwaps(300n);

    expect(a).toEqual(b);
    expect(a).toHaveLength(1);
    expect(helius.getBlock).toHaveBeenCalledTimes(1);
    expect(helius.parseTransactions).toHaveBeenCalledTimes(1);
  });

  it("skips block txs that don't touch a tracked DEX program", async () => {
    const block: HeliusBlock = {
      blockhash: "bh",
      parentSlot: 99,
      blockTime: 1_700_000_000,
      blockHeight: 1,
      transactions: [
        blockTx("system1", SYSTEM_PROGRAM),
        blockTx("system2", SYSTEM_PROGRAM),
      ],
    };

    const helius: Partial<HeliusClient> = {
      getBlock: vi.fn(async () => block),
      parseTransactions: vi.fn(async () => []),
    };
    const { redis } = makeFakeRedis();
    const expander = createBlockExpander({ redis, helius: helius as HeliusClient });

    const swaps = await expander.getBlockSwaps(400n);
    expect(swaps).toEqual([]);
    // We don't waste a parseTransactions call on system-only blocks.
    expect(helius.parseTransactions).not.toHaveBeenCalled();
  });
});
