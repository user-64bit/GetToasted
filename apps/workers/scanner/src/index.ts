import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { HeliusClient, type HeliusParsedTx } from "@get-toasted/helius";
import {
  detectSandwichesAcrossSlots,
  TRACKED_DEX_PROGRAM_IDS,
  type ParsedSwap,
} from "@get-toasted/core";
import { createDb, detectedSandwiches, wallets as walletsTbl } from "@get-toasted/db";
import { eq } from "drizzle-orm";

const REDIS_URL = process.env.REDIS_URL;
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!REDIS_URL || !HELIUS_API_KEY || !DATABASE_URL) {
  throw new Error("Missing required env vars: REDIS_URL, HELIUS_API_KEY, DATABASE_URL");
}

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const helius = new HeliusClient(HELIUS_API_KEY);
const db = createDb(DATABASE_URL);

/**
 * Convert a Helius parsed transaction into ParsedSwap[] entries.
 * Returns empty array if the tx is not a DEX swap we track.
 */
function heliusTxToParsedSwaps(tx: HeliusParsedTx): ParsedSwap[] {
  if (tx.type !== "SWAP" || tx.transactionError !== null) return [];

  const swapEvent = tx.events?.swap;
  if (!swapEvent) return [];

  // Use innerSwaps if present (Jupiter aggregator routes) — each leg is a swap
  const legs = swapEvent.innerSwaps ?? [];

  if (legs.length === 0) {
    // Simple single-hop swap — check source program
    const matchedProgram = [...TRACKED_DEX_PROGRAM_IDS].find((pid) =>
      tx.instructions?.some((ix) => ix.programId === pid),
    );
    if (!matchedProgram) return [];

    const inputTransfer = swapEvent.tokenInputs?.[0] ?? swapEvent.nativeInput;
    const outputTransfer = swapEvent.tokenOutputs?.[0] ?? swapEvent.nativeOutput;
    if (!inputTransfer || !outputTransfer) return [];

    const isNativeInput = "account" in inputTransfer;
    const isNativeOutput = "account" in (swapEvent.tokenOutputs?.[0] ?? swapEvent.nativeOutput ?? {});

    return [
      {
        signature: tx.signature,
        slot: tx.slot,
        txIndexInBlock: 0, // Helius parsed txns don't include blockIndex — set when we have block data
        signer: tx.feePayer,
        pool: matchedProgram, // Use programId as pool key for single-hop (refine with pool account later)
        programId: matchedProgram,
        inputMint: isNativeInput
          ? "So11111111111111111111111111111111111111112"
          : (inputTransfer as NonNullable<typeof swapEvent.tokenInputs>[0]).mint,
        outputMint: isNativeOutput
          ? "So11111111111111111111111111111111111111112"
          : (swapEvent.tokenOutputs?.[0])?.mint ?? "So11111111111111111111111111111111111111112",
        inputAmount: BigInt(
          isNativeInput
            ? (inputTransfer as { account: string; amount: string }).amount
            : (inputTransfer as NonNullable<typeof swapEvent.tokenInputs>[0]).rawTokenAmount.tokenAmount,
        ),
        outputAmount: BigInt(
          swapEvent.tokenOutputs?.[0]?.rawTokenAmount.tokenAmount ??
            swapEvent.nativeOutput?.amount ??
            "0",
        ),
        jitoBundled: false, // TODO: detect via Jito tip account presence in nativeTransfers
        failed: false,
      },
    ];
  }

  // Multi-hop: return one ParsedSwap per inner swap that hits a tracked DEX
  return legs
    .filter((leg) => (TRACKED_DEX_PROGRAM_IDS as Set<string>).has(leg.programInfo.account))
    .map((leg) => ({
      signature: tx.signature,
      slot: tx.slot,
      txIndexInBlock: 0,
      signer: tx.feePayer,
      pool: leg.programInfo.account,
      programId: leg.programInfo.account,
      inputMint: leg.tokenInputs[0]?.mint ?? "So11111111111111111111111111111111111111112",
      outputMint: leg.tokenOutputs[0]?.mint ?? "So11111111111111111111111111111111111111112",
      inputAmount: BigInt(leg.tokenInputs[0]?.rawTokenAmount.tokenAmount ?? "0"),
      outputAmount: BigInt(leg.tokenOutputs[0]?.rawTokenAmount.tokenAmount ?? "0"),
      jitoBundled: false,
      failed: false,
    }));
}

new Worker(
  "scan-historical",
  async (job: Job<{ wallet: string }>) => {
    const { wallet } = job.data;
    let cursor: string | undefined;
    let totalProcessed = 0;

    // Paginate through all of the wallet's transactions
    while (true) {
      const batch = await helius.getTransactionsForAddress({
        address: wallet,
        limit: 100,
        before: cursor,
      });

      if (batch.length === 0) break;

      // Convert each tx → ParsedSwap[] and flatten
      const parsedSwaps: ParsedSwap[] = batch.flatMap(heliusTxToParsedSwaps);

      if (parsedSwaps.length > 0) {
        const sandwiches = detectSandwichesAcrossSlots(parsedSwaps);

        if (sandwiches.length > 0) {
          const lastTx = batch[batch.length - 1]!;
          const blockTime = new Date((lastTx.timestamp ?? Date.now() / 1000) * 1000);

          await db
            .insert(detectedSandwiches)
            .values(
              sandwiches.map((s) => ({
                slot: BigInt(s.slot),
                blockTime,
                pool: s.pool,
                dex: s.front.programId.slice(0, 16), // short label until we map programId → dex name
                attacker: s.attacker,
                victimWallet: s.victim,
                validatorVote: "", // TODO: populate via leader-schedule cache
                frontSig: s.front.signature,
                victimSig: s.victimSwap.signature,
                backSig: s.back.signature,
                jitoBundled: s.jitoBundled,
                inputMint: s.front.inputMint,
                outputMint: s.front.outputMint,
                victimInAmt: s.victimSwap.inputAmount.toString(),
                victimOutAmt: s.victimSwap.outputAmount.toString(),
              })),
            )
            .onConflictDoNothing();
        }
      }

      totalProcessed += batch.length;
      await job.updateProgress(Math.min(95, Math.floor(totalProcessed / 10)));

      cursor = batch[batch.length - 1]!.signature;
      if (batch.length < 100) break; // last page
    }

    // Mark wallet scan as complete
    await db
      .update(walletsTbl)
      .set({
        scanStatus: "complete",
        lastScanAt: new Date(),
        totalTxCount: totalProcessed,
      })
      .where(eq(walletsTbl.address, wallet));

    return { wallet, totalProcessed };
  },
  {
    connection,
    concurrency: 5,
    limiter: { max: 50, duration: 1000 },
  },
);

console.log("scanner worker up — consuming queue: scan-historical");
