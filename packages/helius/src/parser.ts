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
  const tokenIn = leg.tokenInputs[0];
  const tokenOut = leg.tokenOutputs[0];
  if (!tokenIn || !tokenOut) return null;

  const inputAmount = BigInt(tokenIn.rawTokenAmount.tokenAmount);
  const outputAmount = BigInt(tokenOut.rawTokenAmount.tokenAmount);
  if (inputAmount <= 0n || outputAmount <= 0n) return null;

  const programId = leg.programInfo.account;
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

export function parseHeliusTxToSwaps(
  tx: HeliusEnhancedTransaction,
  opts: ParseOptions = {},
): ParsedSwap[] {
  if (tx.type !== "SWAP") return [];

  const swap = tx.events?.swap;
  if (!swap) return [];

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

  // Multi-leg Jupiter route — emit one ParsedSwap per leg that hits a tracked DEX
  const innerSwaps = swap.innerSwaps ?? [];
  const trackedLegs = innerSwaps.filter((leg) =>
    TRACKED_DEX_PROGRAM_ID_SET.has(leg.programInfo.account),
  );

  if (trackedLegs.length > 0) {
    const out: ParsedSwap[] = [];
    for (const leg of trackedLegs) {
      const ps = legToSwap(leg, base);
      if (ps) out.push(ps);
    }
    return out;
  }

  // Single-hop swap — synthesize from top-level swap event + tracked program
  const programInfo = pickProgramAndPool(tx);
  if (!programInfo) return [];

  const io = pickInputOutput(swap);
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
