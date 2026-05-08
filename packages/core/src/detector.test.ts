import { describe, it, expect } from "vitest";
import {
  detectL1JitoBundle,
  detectL2Adjacency,
  detectSandwichForVictim,
  detectSandwichesForWalletSwaps,
  isSandwichShape,
  type JitoBundleInfo,
  type JitoBundleResolver,
  type ParsedSwap,
  type PoolReserves,
} from "./detector.js";

const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const RAYDIUM_AMM_V4 = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
const ATTACKER = "ATTACKER";
const VICTIM_WALLET = "VICTIM";

const DEFAULT_RESERVES: PoolReserves = {
  tokenA: 10_000_000_000_000n, // 10,000 USDC at 6 decimals
  tokenB: 50_000_000_000n, // 50 SOL at 9 decimals
  tokenAMint: USDC,
  tokenBMint: SOL,
};

function mkSwap(overrides: Partial<ParsedSwap>): ParsedSwap {
  return {
    signature: "sig",
    slot: 100n,
    txIndexInBlock: 0,
    blockTime: new Date("2026-01-01T00:00:00Z"),
    signer: "X",
    pool: "POOL1",
    programId: RAYDIUM_AMM_V4,
    dex: "raydium_amm_v4",
    inputMint: USDC,
    outputMint: SOL,
    inputAmount: 1_000_000_000n, // 1000 USDC
    outputAmount: 5_000_000n, // 0.005 SOL
    jitoTipLamports: null,
    jitoBundled: false,
    inputDecimals: 6,
    outputDecimals: 9,
    failed: false,
    poolReservesBefore: null,
    poolReservesAfter: null,
    ...overrides,
  };
}

function mkSandwichTriple(overrides: {
  attackerSig?: string;
  victimSlot?: bigint;
  pool?: string;
  failedBack?: boolean;
  reserves?: PoolReserves | null;
} = {}) {
  const slot = overrides.victimSlot ?? 100n;
  const pool = overrides.pool ?? "POOL1";
  // `??` would treat explicit `null` as "use default" — that's the
  // opposite of what we want when a test asks for "no reserves attached".
  const reserves =
    overrides.reserves === undefined ? DEFAULT_RESERVES : overrides.reserves;
  const front = mkSwap({
    signer: ATTACKER,
    txIndexInBlock: 5,
    signature: "front_sig",
    slot,
    pool,
    inputMint: USDC,
    outputMint: SOL,
    inputAmount: 1_000_000_000n,
    outputAmount: 4_950_000n,
    poolReservesBefore: reserves,
  });
  const victim = mkSwap({
    signer: VICTIM_WALLET,
    txIndexInBlock: 6,
    signature: "victim_sig",
    slot,
    pool,
    inputMint: USDC,
    outputMint: SOL,
    inputAmount: 500_000_000n,
    outputAmount: 2_400_000n,
  });
  const back = mkSwap({
    signer: ATTACKER,
    txIndexInBlock: 7,
    signature: "back_sig",
    slot,
    pool,
    inputMint: SOL,
    outputMint: USDC,
    inputAmount: 4_950_000n,
    outputAmount: 1_100_000_000n,
    failed: overrides.failedBack ?? false,
  });
  return { front, victim, back };
}

function makeJitoStub(bundles: JitoBundleInfo[] = []): JitoBundleResolver {
  const map = new Map<string, JitoBundleInfo>();
  for (const b of bundles) {
    for (const sig of b.signaturesInBundle) map.set(sig, b);
  }
  return {
    async getBundleForTx(sig: string) {
      return map.get(sig) ?? null;
    },
  };
}

describe("isSandwichShape", () => {
  it("returns true for a textbook A→B→A pattern with same-signer front+back", () => {
    const { front, victim, back } = mkSandwichTriple();
    expect(isSandwichShape(victim, front, back)).toBe(true);
  });

  it("rejects when front and back have different signers (arbitrage between MMs)", () => {
    const { front, victim, back } = mkSandwichTriple();
    expect(isSandwichShape(victim, front, { ...back, signer: "OTHER" })).toBe(false);
  });

  it("rejects self-sandwich (attacker == victim signer)", () => {
    const { front, victim, back } = mkSandwichTriple();
    expect(isSandwichShape({ ...victim, signer: ATTACKER }, front, back)).toBe(false);
  });

  it("rejects when front pool differs from victim pool", () => {
    const { front, victim, back } = mkSandwichTriple();
    expect(isSandwichShape(victim, { ...front, pool: "OTHER_POOL" }, back)).toBe(false);
  });

  it("rejects when back direction is not reversed", () => {
    const { front, victim, back } = mkSandwichTriple();
    expect(
      isSandwichShape(victim, front, { ...back, inputMint: USDC, outputMint: SOL }),
    ).toBe(false);
  });
});

describe("detectL2Adjacency", () => {
  it("fires at confidence 0.95 when front/victim/back are at consecutive indices", async () => {
    const { front, victim, back } = mkSandwichTriple();
    const match = detectL2Adjacency(victim, [front, back]);
    expect(match).not.toBeNull();
    expect(match!.layer).toBe("L2");
    expect(match!.confidence).toBe(0.95);
    expect(match!.status).toBe("confirmed");
    expect(match!.attacker).toBe(ATTACKER);
    expect(match!.jitoBundled).toBe(false);
  });

  it("still fires when a tip-transfer tx interleaves front and victim (bundle landed contiguously, but the non-DEX tip tx advances the block index)", () => {
    // Real Jito bundle: front at idx 5, tip-transfer at 6 (NOT in
    // candidates because it's a system-program tx), victim at 7,
    // back at 8. Strict adjacency would miss this; nearest-neighbor
    // catches it.
    const { front, victim, back } = mkSandwichTriple();
    const reIndexedVictim = { ...victim, txIndexInBlock: 7 };
    const reIndexedBack = { ...back, txIndexInBlock: 8 };
    const match = detectL2Adjacency(reIndexedVictim, [front, reIndexedBack]);
    expect(match).not.toBeNull();
    expect(match!.layer).toBe("L2");
  });

  it("ignores other-pool swaps between the bot's legs (filtered before reaching L2)", () => {
    // The orchestrator filters by same-pool, but L2 also re-filters
    // defensively — a different-pool same-block swap shouldn't disrupt
    // detection.
    const { front, victim, back } = mkSandwichTriple();
    const noiseSwap = mkSwap({
      txIndexInBlock: 6, // sits between front (5) and victim (effectively 7 below)
      signer: "RANDOM_TRADER",
      pool: "OTHER_POOL",
      signature: "noise",
    });
    const match = detectL2Adjacency(victim, [front, back, noiseSwap]);
    expect(match).not.toBeNull();
  });

  it("skips an interleaving same-pool swap by another trader and keeps searching for the bot's back-run", () => {
    // Another trader hits the same pool between bot.front and bot.back.
    // The closest-following candidate is the unrelated trader (wrong
    // signer). The relaxed L2 keeps walking outward and finds the bot's
    // real back-run further out.
    const { front, victim, back } = mkSandwichTriple();
    const interloperBack = mkSwap({
      txIndexInBlock: 6, // between victim (txIndex 6) — wait, need to re-space
      signer: "OTHER_TRADER",
      pool: "POOL1",
      inputMint: SOL,
      outputMint: USDC,
      signature: "interloper",
    });
    // Reposition: front=5, victim=6, interloper=7, real_back=8.
    const interloper = { ...interloperBack, txIndexInBlock: 7 };
    const realBack = { ...back, txIndexInBlock: 8 };
    const match = detectL2Adjacency(victim, [front, interloper, realBack]);
    expect(match).not.toBeNull();
    expect(match!.attacker).toBe(ATTACKER);
    expect(match!.backRun.signature).toBe("back_sig");
  });

  it("returns null when back-run sells <95% of front-run output (arb-shaped triple)", () => {
    const { front, victim, back } = mkSandwichTriple();
    const tinyBack = { ...back, inputAmount: 1_000n };
    expect(detectL2Adjacency(victim, [front, tinyBack])).toBeNull();
  });

  it("returns null when the front-run is failed (no slippage was caused)", () => {
    const { front, victim, back } = mkSandwichTriple();
    expect(detectL2Adjacency(victim, [{ ...front, failed: true }, back])).toBeNull();
  });

  it("still fires when the back-run is failed — victim ate front-run slippage", () => {
    const { front, victim, back } = mkSandwichTriple();
    const failedBack = { ...back, failed: true, inputAmount: 0n };
    const match = detectL2Adjacency(victim, [front, failedBack]);
    expect(match).not.toBeNull();
    expect(match!.layer).toBe("L2");
  });

  it("sets jitoBundled=true and carries tipLamports when either leg has a Jito tip", () => {
    // Either leg can carry the tip — Jito allows it on any bundle tx.
    const { front, victim, back } = mkSandwichTriple();
    const tippedFront = { ...front, jitoTipLamports: 100_000n };
    const match = detectL2Adjacency(victim, [tippedFront, back]);
    expect(match!.jitoBundled).toBe(true);
    expect(match!.jitoTipLamports).toBe(100_000n);

    const tippedBack = { ...back, jitoTipLamports: 75_000n };
    const m2 = detectL2Adjacency(victim, [front, tippedBack]);
    expect(m2!.jitoBundled).toBe(true);
    expect(m2!.jitoTipLamports).toBe(75_000n);
  });

  it("returns null when no same-pool candidates exist", () => {
    const victim = mkSwap({ txIndexInBlock: 6, signer: VICTIM_WALLET });
    expect(detectL2Adjacency(victim, [])).toBeNull();
  });
});

describe("detectL1JitoBundle", () => {
  it("fires at confidence 1.00 when victim is in middle of a 3-tx bundle with sandwich shape", async () => {
    const { front, victim, back } = mkSandwichTriple();
    const jito = makeJitoStub([
      {
        bundleId: "bundle1",
        signaturesInBundle: ["front_sig", "victim_sig", "back_sig"],
        landedSlot: 100,
        tipLamports: 50_000n,
      },
    ]);
    const match = await detectL1JitoBundle(victim, [front, back], jito);
    expect(match).not.toBeNull();
    expect(match!.layer).toBe("L1");
    expect(match!.confidence).toBe(1.0);
    expect(match!.jitoBundled).toBe(true);
    expect(match!.jitoTipLamports).toBe(50_000n);
  });

  it("returns null when victim is at index 0 of the bundle (jito-dontfront usage)", async () => {
    const { front, victim, back } = mkSandwichTriple();
    const jito = makeJitoStub([
      {
        bundleId: "bundle1",
        signaturesInBundle: ["victim_sig", "front_sig", "back_sig"],
        landedSlot: 100,
        tipLamports: 50_000n,
      },
    ]);
    expect(await detectL1JitoBundle(victim, [front, back], jito)).toBeNull();
  });

  it("returns null when victim is the last sig in the bundle (no back-run)", async () => {
    const { front, victim, back } = mkSandwichTriple();
    const jito = makeJitoStub([
      {
        bundleId: "bundle1",
        signaturesInBundle: ["front_sig", "back_sig", "victim_sig"],
        landedSlot: 100,
        tipLamports: 50_000n,
      },
    ]);
    expect(await detectL1JitoBundle(victim, [front, back], jito)).toBeNull();
  });

  it("returns null when victim is not in any bundle", async () => {
    const { front, victim, back } = mkSandwichTriple();
    const jito = makeJitoStub([]);
    expect(await detectL1JitoBundle(victim, [front, back], jito)).toBeNull();
  });

  it("returns null when bundle includes non-sandwich-shape swaps next to victim", async () => {
    const { victim } = mkSandwichTriple();
    const otherFront = mkSwap({
      signature: "front_sig",
      signer: "OTHER_BOT",
      pool: "DIFFERENT_POOL",
      txIndexInBlock: 5,
    });
    const otherBack = mkSwap({
      signature: "back_sig",
      signer: "OTHER_BOT",
      pool: "DIFFERENT_POOL",
      txIndexInBlock: 7,
    });
    const jito = makeJitoStub([
      {
        bundleId: "bundle1",
        signaturesInBundle: ["front_sig", "victim_sig", "back_sig"],
        landedSlot: 100,
        tipLamports: 50_000n,
      },
    ]);
    // Front and back are on a different pool — not a sandwich.
    expect(await detectL1JitoBundle(victim, [otherFront, otherBack], jito)).toBeNull();
  });

  it("fails closed when the jito resolver throws", async () => {
    const { front, victim, back } = mkSandwichTriple();
    const flakyJito: JitoBundleResolver = {
      async getBundleForTx() {
        throw new Error("network down");
      },
    };
    expect(await detectL1JitoBundle(victim, [front, back], flakyJito)).toBeNull();
  });
});

describe("detectSandwichForVictim — orchestration + post-filters", () => {
  it("short-circuits at L1 when bundle membership is present", async () => {
    const { front, victim, back } = mkSandwichTriple();
    const jito = makeJitoStub([
      {
        bundleId: "bundle1",
        signaturesInBundle: ["front_sig", "victim_sig", "back_sig"],
        landedSlot: 100,
        tipLamports: 50_000n,
      },
    ]);
    const det = await detectSandwichForVictim({
      victim,
      candidates: [front, back],
      jito,
    });
    expect(det).not.toBeNull();
    expect(det!.layer).toBe("L1");
    expect(det!.loss.method).toBeDefined();
    expect(det!.detectedAt).toBeInstanceOf(Date);
  });

  it("falls through to L2 when bundle lookup returns null but adjacency is present", async () => {
    const { front, victim, back } = mkSandwichTriple();
    const det = await detectSandwichForVictim({
      victim,
      candidates: [front, back],
      jito: makeJitoStub([]),
    });
    expect(det).not.toBeNull();
    expect(det!.layer).toBe("L2");
  });

  it("uses CPMM reconstruction when reserves are available", async () => {
    const { front, victim, back } = mkSandwichTriple();
    const det = await detectSandwichForVictim({
      victim,
      candidates: [front, back],
      jito: makeJitoStub([]),
    });
    expect(det!.loss.method).toBe("cpmm-reconstruction");
    expect(det!.loss.lossConfidence).toBe(1.0);
    expect(det!.loss.lossInOutputToken).toBeGreaterThan(0n);
  });

  it("falls back to back-run profit proxy when reserves are missing", async () => {
    const { front, victim, back } = mkSandwichTriple({ reserves: null });
    const det = await detectSandwichForVictim({
      victim,
      candidates: [front, back],
      jito: makeJitoStub([]),
    });
    expect(det!.loss.method).toBe("backrun-profit-proxy");
    expect(det!.loss.lossConfidence).toBe(0.85);
  });

  it("uses failed-backrun-slippage method when back-run reverted", async () => {
    const { front, victim, back } = mkSandwichTriple({ failedBack: true, reserves: null });
    const det = await detectSandwichForVictim({
      victim,
      candidates: [front, back],
      jito: makeJitoStub([]),
    });
    expect(det!.loss.method).toBe("failed-backrun-slippage");
    expect(det!.loss.lossConfidence).toBe(0.5);
  });

  it("drops the detection when self-sandwich (victim is the attacker)", async () => {
    const { front, victim, back } = mkSandwichTriple();
    const selfVictim = { ...victim, signer: ATTACKER };
    const det = await detectSandwichForVictim({
      victim: selfVictim,
      candidates: [front, back],
      jito: makeJitoStub([]),
    });
    expect(det).toBeNull();
  });

  it("drops the detection when victim swap itself is failed", async () => {
    const { front, victim, back } = mkSandwichTriple();
    const det = await detectSandwichForVictim({
      victim: { ...victim, failed: true },
      candidates: [front, back],
      jito: makeJitoStub([]),
    });
    expect(det).toBeNull();
  });

  it("admits a tight (L2) sandwich even when relative loss is below 0.1%", async () => {
    // Adjacent same-pool same-signer pair → L2 fires. Loss may be tiny
    // because the front-run barely moves the price (or because back/front
    // spread is small), but a Jito-bundled or block-adjacent sandwich is
    // a mechanically-confirmed attack regardless of extraction size.
    // Guard 2b is L4-only; admitting low-extraction L2 detections is the
    // correct behavior.
    const slot = 100n;
    const front = mkSwap({
      signer: ATTACKER,
      txIndexInBlock: 5,
      signature: "front_sig",
      slot,
      inputAmount: 1_000_000_000n,
      outputAmount: 5_000_000n,
    });
    const victim = mkSwap({
      signer: VICTIM_WALLET,
      txIndexInBlock: 6,
      signature: "victim_sig",
      slot,
      inputAmount: 500_000_000n,
      outputAmount: 2_500_000n, // gets exactly the same rate as front
    });
    const back = mkSwap({
      signer: ATTACKER,
      txIndexInBlock: 7,
      signature: "back_sig",
      slot,
      inputMint: SOL,
      outputMint: USDC,
      inputAmount: 5_000_000n,
      outputAmount: 1_000_000_000n,
    });
    const det = await detectSandwichForVictim({
      victim,
      candidates: [front, back],
      jito: makeJitoStub([]),
    });
    expect(det).not.toBeNull();
    expect(det!.layer).toBe("L2");
  });
});

describe("detectSandwichesForWalletSwaps", () => {
  it("finds the wallet's sandwich among a mixed-block swap set", async () => {
    const { front, victim, back } = mkSandwichTriple();
    const noise = mkSwap({
      signature: "noise_sig",
      txIndexInBlock: 9,
      signer: "RANDOM",
      pool: "OTHER_POOL",
    });
    const detections = await detectSandwichesForWalletSwaps({
      wallet: VICTIM_WALLET,
      walletSwaps: [victim],
      blockSwaps: [front, victim, back, noise],
      jito: makeJitoStub([]),
    });
    expect(detections).toHaveLength(1);
    expect(detections[0]!.victim.signature).toBe("victim_sig");
    expect(detections[0]!.layer).toBe("L2");
  });

  it("ignores wallet swaps whose signer doesn't match the wallet (defensive)", async () => {
    const { front, victim, back } = mkSandwichTriple();
    // Wallet swap list contains a stray non-wallet swap (shouldn't happen,
    // but guards against caller bugs).
    const detections = await detectSandwichesForWalletSwaps({
      wallet: VICTIM_WALLET,
      walletSwaps: [{ ...victim, signer: "OTHER" }],
      blockSwaps: [front, victim, back],
      jito: makeJitoStub([]),
    });
    expect(detections).toHaveLength(0);
  });

  it("only considers same-pool candidates for a victim", async () => {
    const { front, victim, back } = mkSandwichTriple();
    // A different pool's sandwich-shape triple in the same block — must
    // not contaminate the victim's detection.
    const otherPoolSwap = mkSwap({
      signature: "otherpool_sig",
      txIndexInBlock: 100,
      signer: "BOT2",
      pool: "OTHER_POOL",
    });
    const detections = await detectSandwichesForWalletSwaps({
      wallet: VICTIM_WALLET,
      walletSwaps: [victim],
      blockSwaps: [front, victim, back, otherPoolSwap],
      jito: makeJitoStub([]),
    });
    expect(detections).toHaveLength(1);
    expect(detections[0]!.pool).toBe(victim.pool);
  });
});
