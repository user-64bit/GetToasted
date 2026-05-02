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

function pickProgramAndPool(tx: HeliusEnhancedTransaction): { programId: string; pool: string } | null {
  if (!tx.instructions || tx.instructions.length === 0) return null;

  for (const ix of tx.instructions) {
    if (TRACKED_DEX_PROGRAM_ID_SET.has(ix.programId)) {
      const pool = ix.accounts?.find((a) => a !== ix.programId) ?? ix.programId;
      return { programId: ix.programId, pool };
    }
  }

  for (const ix of tx.instructions) {
    for (const inner of ix.innerInstructions ?? []) {
      if (TRACKED_DEX_PROGRAM_ID_SET.has(inner.programId)) {
        const pool = inner.accounts?.find((a) => a !== inner.programId) ?? inner.programId;
        return { programId: inner.programId, pool };
      }
    }
  }

  return null;
}

function legPool(leg: HeliusInnerSwap): string {
  return leg.programInfo.account || leg.programInfo.source || "unknown";
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
    pool: legPool(leg),
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

  // If we don't already have an SOL_MINT entry from wrapped-SOL changes, add
  // one synthesized from native transfers (excluding Jito tips). Many DEXes
  // route SOL legs as plain native transfers, so this is the difference
  // between "we see the wallet's swap" and "we see only one side".
  if (!byMint.has(SOL_MINT)) {
    let nativeDelta = 0n;
    for (const t of tx.nativeTransfers ?? []) {
      const amount = BigInt(Math.floor(t.amount));
      if (t.fromUserAccount === wallet) {
        // Exclude tip transfers — they're not part of the swap input.
        if (t.toUserAccount && tipAccounts.has(t.toUserAccount)) continue;
        nativeDelta -= amount;
      } else if (t.toUserAccount === wallet) {
        nativeDelta += amount;
      }
    }
    if (nativeDelta !== 0n) {
      byMint.set(SOL_MINT, { delta: nativeDelta, decimals: SOL_DECIMALS });
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
  if (tx.type !== "SWAP") return [];

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
  const programInfo = pickProgramAndPool(tx);
  if (!programInfo) return [];

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
      pool: programInfo.pool,
      programId: programInfo.programId,
      dex: getDex(programInfo.programId),
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
