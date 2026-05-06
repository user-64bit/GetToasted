import {
  getDex,
  isJitoTipTransfer,
  JITO_TIP_ACCOUNTS_SEED,
  SOL_MINT,
  TRACKED_DEX_PROGRAM_ID_SET,
  type Dex,
  type ParsedSwap,
} from "@get-toasted/core";
import type {
  HeliusEnhancedTransaction,
  HeliusInnerSwap,
  HeliusSwapEvent,
  HeliusTokenInput,
} from "./client.js";

const SOL_DECIMALS = 9;

export type ParseOptions = {
  txIndexInBlock?: number;
  jitoTipAccounts?: ReadonlySet<string>;
};

export function extractJitoTipLamports(
  tx: HeliusEnhancedTransaction,
  tipAccounts: ReadonlySet<string> = JITO_TIP_ACCOUNTS_SEED,
): bigint | null {
  const transfers = tx.nativeTransfers ?? [];
  let tip = 0n;
  for (const t of transfers) {
    if (t.toUserAccount && isJitoTipTransfer(t.toUserAccount, tipAccounts)) {
      tip += BigInt(Math.floor(t.amount));
    }
  }
  return tip > 0n ? tip : null;
}

function pickProgramId(tx: HeliusEnhancedTransaction): string | null {
  if (!tx.instructions || tx.instructions.length === 0) return null;

  for (const ix of tx.instructions) {
    if (TRACKED_DEX_PROGRAM_ID_SET.has(ix.programId)) {
      return ix.programId;
    }
  }

  for (const ix of tx.instructions) {
    for (const inner of ix.innerInstructions ?? []) {
      if (TRACKED_DEX_PROGRAM_ID_SET.has(inner.programId)) {
        return inner.programId;
      }
    }
  }

  return null;
}

/**
 * Pool key construction.
 *
 * Sandwich detection groups swaps as candidates by `pool` — the bot's
 * front-run, the victim's swap, and the bot's back-run all need to map
 * to the same key for `isSandwichShape` to fire.
 *
 * The two parsing paths used to disagree:
 *   - Direct swap path: pulled the first non-programId account out of
 *     the instruction. For Raydium AMM v4 that's `tokenProgram`
 *     (TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA), not the AMM ID.
 *     Wrong-but-consistent for direct swaps; every Raydium AMM v4 hit
 *     mapped to the same string.
 *   - Jupiter-leg path: used `leg.programInfo.account`, which Helius
 *     fills with the *program ID* of the leg's DEX. For a Raydium leg
 *     that's `675kPX...`.
 *
 * The two paths produced different strings for the same physical pool.
 * A Jupiter-routed victim plus a direct-swap front+back never matched
 * the same-pool filter — silent detection miss for any wallet that
 * uses Jupiter (i.e. most retail traders).
 *
 * This synthetic key fixes the mismatch:
 *   `${programId}:${[inputMint, outputMint].sort().join("-")}`
 *
 *   - programId discriminates DEXes
 *   - sorted mint pair discriminates token pairs (USDC/SOL vs USDC/BONK)
 *   - sorting makes the key direction-invariant (front buys USDC→SOL,
 *     back sells SOL→USDC — both produce the same key, which is what
 *     we want)
 *   - identical across direct and Jupiter-leg paths because both have
 *     programId + mints
 *
 * Remaining ambiguity: two physical pools on the same DEX with the
 * same mint pair (e.g. two Raydium AMM v4 USDC/SOL pools at different
 * tick spacings) collide under this key. In practice that only matters
 * if a real sandwich on pool A is mis-paired with an unrelated trader
 * on pool B; `isSandwichShape` still requires same f+b signer and the
 * 95% sell-through tolerance, so a false positive needs both
 * coincident traders AND a matching shape — vanishingly rare.
 *
 * Proper per-DEX pool-account resolution (per-program-ID offset into
 * the instruction's accounts array) would replace this with the real
 * on-chain address; defer until a future refactor when we wire up
 * per-DEX layouts.
 */
function poolKey(programId: string, inputMint: string, outputMint: string): string {
  const [a, b] = inputMint < outputMint ? [inputMint, outputMint] : [outputMint, inputMint];
  return `${programId}:${a}-${b}`;
}

function pickInputOutput(swap: HeliusSwapEvent): {
  inputMint: string;
  outputMint: string;
  inputAmount: bigint;
  outputAmount: bigint;
  inputDecimals: number;
  outputDecimals: number;
} | null {
  const tokenIn = swap.tokenInputs?.[0];
  const tokenOut = swap.tokenOutputs?.[0];

  let inputMint: string | null = null;
  let inputAmount: bigint = 0n;
  let inputDecimals = 0;

  if (swap.nativeInput && BigInt(swap.nativeInput.amount) > 0n) {
    inputMint = SOL_MINT;
    inputAmount = BigInt(swap.nativeInput.amount);
    inputDecimals = SOL_DECIMALS;
  } else if (tokenIn) {
    inputMint = tokenIn.mint;
    inputAmount = BigInt(tokenIn.rawTokenAmount.tokenAmount);
    inputDecimals = tokenIn.rawTokenAmount.decimals;
  }

  let outputMint: string | null = null;
  let outputAmount: bigint = 0n;
  let outputDecimals = 0;

  if (swap.nativeOutput && BigInt(swap.nativeOutput.amount) > 0n) {
    outputMint = SOL_MINT;
    outputAmount = BigInt(swap.nativeOutput.amount);
    outputDecimals = SOL_DECIMALS;
  } else if (tokenOut) {
    outputMint = tokenOut.mint;
    outputAmount = BigInt(tokenOut.rawTokenAmount.tokenAmount);
    outputDecimals = tokenOut.rawTokenAmount.decimals;
  }

  if (!inputMint || !outputMint) return null;
  if (inputAmount <= 0n || outputAmount <= 0n) return null;

  return {
    inputMint,
    outputMint,
    inputAmount,
    outputAmount,
    inputDecimals,
    outputDecimals,
  };
}

function legToSwap(
  leg: HeliusInnerSwap,
  base: Pick<ParsedSwap, "signature" | "slot" | "txIndexInBlock" | "blockTime" | "signer" | "jitoTipLamports" | "jitoBundled" | "failed">,
): ParsedSwap | null {
  const tokenIn = leg.tokenInputs?.[0];
  const tokenOut = leg.tokenOutputs?.[0];
  // Helius occasionally emits inner-swap legs missing rawTokenAmount entirely
  // (seen on some custom routes). Defensive guard: skip rather than throw,
  // otherwise one malformed leg kills the parse for the whole tx.
  if (!tokenIn?.rawTokenAmount || !tokenOut?.rawTokenAmount) return null;
  if (!tokenIn.mint || !tokenOut.mint) return null;

  let inputAmount: bigint;
  let outputAmount: bigint;
  try {
    inputAmount = BigInt(tokenIn.rawTokenAmount.tokenAmount);
    outputAmount = BigInt(tokenOut.rawTokenAmount.tokenAmount);
  } catch {
    return null;
  }
  if (inputAmount <= 0n || outputAmount <= 0n) return null;

  const programId = leg.programInfo?.account;
  if (!programId) return null;
  const dex: Dex = getDex(programId);

  return {
    ...base,
    pool: poolKey(programId, tokenIn.mint, tokenOut.mint),
    programId,
    dex,
    inputMint: tokenIn.mint,
    outputMint: tokenOut.mint,
    inputAmount,
    outputAmount,
    inputDecimals: tokenIn.rawTokenAmount.decimals,
    outputDecimals: tokenOut.rawTokenAmount.decimals,
  };
}

/**
 * Fallback: reconstruct the wallet's swap input/output from balance deltas.
 * Required because Helius leaves `events.swap` empty (or absent entirely)
 * for many DEXes — Meteora DAMM v2 returns `events.swap = {}`, and PUMP_FUN
 * / PUMP_AMM / many others omit the field. Without this fallback the
 * parser silently drops the vast majority of swaps.
 *
 * Strategy:
 *   1. Sum token deltas per mint where `userAccount === feePayer` from
 *      `accountData[].tokenBalanceChanges`. Wrapped-SOL legs naturally
 *      surface here as a regular SOL_MINT change, so no special casing.
 *   2. If only one side surfaces from tokens (typical for buys/sells with
 *      native SOL), compute the SOL leg from `nativeTransfers` minus
 *      Jito-tip transfers, and treat it as a synthetic SOL_MINT delta.
 *   3. Pick the largest absolute negative delta as input and the largest
 *      positive as output.
 *
 * The native-SOL reconstruction is approximate (a few thousand lamports of
 * ATA rent get bundled in) but the detector only matches on
 * (slot, pool, mints, signer) — small amount drift doesn't affect
 * triple-matching, and downstream loss math uses the *attacker*'s
 * front/back deltas which surface cleanly via tokenBalanceChanges anyway.
 *
 * Returns null if we can't pin down both sides — caller drops the tx.
 */
function reconstructIoFromAccountData(
  tx: HeliusEnhancedTransaction,
  tipAccounts: ReadonlySet<string>,
): {
  inputMint: string;
  outputMint: string;
  inputAmount: bigint;
  outputAmount: bigint;
  inputDecimals: number;
  outputDecimals: number;
} | null {
  const wallet = tx.feePayer;
  const byMint = new Map<string, { delta: bigint; decimals: number }>();

  for (const acc of tx.accountData ?? []) {
    for (const change of acc.tokenBalanceChanges ?? []) {
      if (change.userAccount !== wallet) continue;
      if (!change.mint || !change.rawTokenAmount) continue;
      let raw: bigint;
      try {
        raw = BigInt(change.rawTokenAmount.tokenAmount);
      } catch {
        continue;
      }
      const prev = byMint.get(change.mint);
      if (prev) {
        prev.delta += raw;
      } else {
        byMint.set(change.mint, { delta: raw, decimals: change.rawTokenAmount.decimals });
      }
    }
  }

  // Always incorporate native SOL transfers into the SOL_MINT balance delta.
  //
  // Previous behaviour: skip when byMint already has SOL_MINT (wSOL entry
  // from tokenBalanceChanges). This was wrong for Meteora DAMM v2 and similar
  // DEXes where the wallet's SOL input is split:
  //   - A small wSOL tokenBalanceChange (e.g. -100,000 lamports — just the
  //     unwrap residual on an ATA close)
  //   - A large native SOL transfer to the pool (e.g. -2,074,080 lamports —
  //     the actual swap value)
  //
  // The guard meant the reconstruction saw only the tiny wSOL delta as the
  // swap input, producing a near-zero SOL input amount. Loss calculation then
  // computed near-zero loss, and Guard 2b dropped the detection entirely.
  //
  // Fix: always compute native SOL delta and add it to whatever wSOL delta
  // is already recorded. The combined figure is what the wallet actually
  // spent/received in native SOL (including wSOL wrapping), which is the
  // correct input for the pool key and loss math.
  {
    let nativeDelta = 0n;
    for (const t of tx.nativeTransfers ?? []) {
      const amount = BigInt(Math.floor(t.amount));
      if (t.fromUserAccount === wallet) {
        // Exclude tip transfers — they're not part of the swap input.
        if (t.toUserAccount && tipAccounts.has(t.toUserAccount)) continue;
        // Exclude ATA creation rent (Token and Token2022) to prevent it from
        // massively inflating the apparent swap size of micro-transactions.
        if (amount === 2_039_280n || amount === 2_074_080n) continue;
        nativeDelta -= amount;
      } else if (t.toUserAccount === wallet) {
        nativeDelta += amount;
      }
    }
    if (nativeDelta !== 0n) {
      const existing = byMint.get(SOL_MINT);
      if (existing) {
        existing.delta += nativeDelta;
      } else {
        byMint.set(SOL_MINT, { delta: nativeDelta, decimals: SOL_DECIMALS });
      }
    }
  }

  let inputMint: string | null = null;
  let inputAmount = 0n;
  let inputDecimals = 0;
  let outputMint: string | null = null;
  let outputAmount = 0n;
  let outputDecimals = 0;

  for (const [mint, { delta, decimals }] of byMint) {
    if (delta < 0n) {
      const absDelta = -delta;
      if (absDelta > inputAmount) {
        inputMint = mint;
        inputAmount = absDelta;
        inputDecimals = decimals;
      }
    } else if (delta > 0n) {
      if (delta > outputAmount) {
        outputMint = mint;
        outputAmount = delta;
        outputDecimals = decimals;
      }
    }
  }

  if (!inputMint || !outputMint || inputAmount <= 0n || outputAmount <= 0n) {
    return null;
  }
  if (inputMint === outputMint) return null;

  return { inputMint, outputMint, inputAmount, outputAmount, inputDecimals, outputDecimals };
}

export function parseHeliusTxToSwaps(
  tx: HeliusEnhancedTransaction,
  opts: ParseOptions = {},
): ParsedSwap[] {
  // We deliberately do NOT gate on `tx.type === "SWAP"`. Helius's enhanced
  // classifier mislabels a large fraction of real swaps as TRANSFER /
  // UNKNOWN (Meteora DAMM v2, Pump bonding-curve buys/sells, several
  // aggregator wrappers). The block-expander has already filtered to txs
  // whose outer or inner instructions touch a tracked DEX program — that's
  // authoritative. Re-applying the type-name filter here was dropping every
  // sandwich victim whose tx Helius mislabeled, making affected wallets
  // surface as "clean" even when they'd been sandwiched.
  //
  // Whether a tx parses as a swap is now determined entirely by:
  //   1. presence of a tracked DEX program in instructions (pickProgramAndPool)
  //   2. ability to extract input/output mints + amounts from either the
  //      structured event or the wallet's tokenBalanceChanges.

  const failed = tx.transactionError !== null;
  const tipAccounts = opts.jitoTipAccounts ?? JITO_TIP_ACCOUNTS_SEED;
  const jitoTipLamports = extractJitoTipLamports(tx, tipAccounts);
  const jitoBundled = jitoTipLamports !== null;
  const blockTime = new Date(tx.timestamp * 1000);

  const base = {
    signature: tx.signature,
    slot: BigInt(tx.slot),
    txIndexInBlock: opts.txIndexInBlock ?? 0,
    blockTime,
    signer: tx.feePayer,
    jitoTipLamports,
    jitoBundled,
    failed,
  };

  const swap = tx.events?.swap;

  // Multi-leg Jupiter route — emit one ParsedSwap per leg that hits a tracked DEX
  if (swap) {
    const innerSwaps = swap.innerSwaps ?? [];
    const trackedLegs = innerSwaps.filter((leg) =>
      TRACKED_DEX_PROGRAM_ID_SET.has(leg.programInfo?.account ?? ""),
    );

    if (trackedLegs.length > 0) {
      const out: ParsedSwap[] = [];
      for (const leg of trackedLegs) {
        const ps = legToSwap(leg, base);
        if (ps) out.push(ps);
      }
      if (out.length > 0) return out;
      // legToSwap returned nothing for every leg (malformed inner swaps);
      // fall through to the synthesized single-hop path below.
    }
  }

  // Single-hop swap — synthesize from top-level swap event + tracked program
  const programId = pickProgramId(tx);
  if (!programId) return [];

  // Try the structured event first.
  let io = swap ? pickInputOutput(swap) : null;
  // Helius leaves `events.swap` empty for several DEXes (Meteora DAMM v2
  // in particular returns `events.swap = {}`). Reconstruct from the
  // wallet's tokenBalanceChanges as a fallback. This is what was silently
  // dropping every Meteora-routed swap at the parser stage and making
  // affected wallets show up as "clean".
  if (!io) io = reconstructIoFromAccountData(tx, tipAccounts);
  if (!io) return [];

  return [
    {
      ...base,
      pool: poolKey(programId, io.inputMint, io.outputMint),
      programId,
      dex: getDex(programId),
      ...io,
    },
  ];
}

// Convenience helper for callers that want to flatten a batch
export function parseHeliusBatchToSwaps(
  txs: HeliusEnhancedTransaction[],
  opts: ParseOptions = {},
): ParsedSwap[] {
  const out: ParsedSwap[] = [];
  txs.forEach((tx, i) => {
    out.push(...parseHeliusTxToSwaps(tx, { ...opts, txIndexInBlock: i }));
  });
  return out;
}
