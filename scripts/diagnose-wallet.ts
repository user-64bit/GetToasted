/**
 * Diagnostic script: trace why a given wallet gets "You're clean" when
 * sandwiched.me says it was attacked.
 *
 * Usage:
 *   pnpm tsx scripts/diagnose-wallet.ts FURrDAcbpHQVW3x4wzzNNKaJuQPqYN6aKHzbb211Dnzn
 *
 * Fetches the wallet's last 20 txs via Helius, parses them to ParsedSwap[],
 * dumps what the parser sees for each swap, and reports whether
 * walletTxTouchesTrackedDex fires.
 */
import "dotenv/config";
import { HeliusClient } from "@get-toasted/helius";
import { parseHeliusTxToSwaps } from "@get-toasted/helius";
import { TRACKED_DEX_PROGRAM_ID_SET } from "@get-toasted/core";
import type { HeliusEnhancedTransaction } from "@get-toasted/helius";

const WALLET = process.argv[2] ?? "FURrDAcbpHQVW3x4wzzNNKaJuQPqYN6aKHzbb211Dnzn";
const HELIUS_KEY = process.env.HELIUS_API_KEY;

if (!HELIUS_KEY) {
  console.error("HELIUS_API_KEY not set");
  process.exit(1);
}

function walletTxTouchesTrackedDex(tx: HeliusEnhancedTransaction): boolean {
  for (const ix of tx.instructions ?? []) {
    if (TRACKED_DEX_PROGRAM_ID_SET.has(ix.programId)) return true;
    for (const inner of ix.innerInstructions ?? []) {
      if (TRACKED_DEX_PROGRAM_ID_SET.has(inner.programId)) return true;
    }
  }
  for (const leg of tx.events?.swap?.innerSwaps ?? []) {
    if (TRACKED_DEX_PROGRAM_ID_SET.has(leg.programInfo?.account ?? "")) return true;
  }
  return false;
}

const client = new HeliusClient(HELIUS_KEY);

console.log(`\n=== Diagnosing wallet: ${WALLET} ===\n`);

const txs = await client.getTransactionsForAddress({ address: WALLET, limit: 20 });
console.log(`Fetched ${txs.length} transactions\n`);

for (const tx of txs) {
  const touches = walletTxTouchesTrackedDex(tx);
  const swaps = touches ? parseHeliusTxToSwaps(tx, { txIndexInBlock: 0 }) : [];

  // Outer program IDs (abbreviated)
  const outerPids = (tx.instructions ?? [])
    .map((ix) => ix.programId.slice(0, 8))
    .filter((p) => p !== "Compute0" && p !== "ATokenGP");

  const innerPids = (tx.instructions ?? [])
    .flatMap((ix) => ix.innerInstructions ?? [])
    .map((ix) => ix.programId.slice(0, 8));

  const legPids = (tx.events?.swap?.innerSwaps ?? []).map(
    (leg) => leg.programInfo?.account?.slice(0, 8) ?? "?",
  );

  console.log(`${tx.signature.slice(0, 30)}... slot=${tx.slot} type=${tx.type}`);
  console.log(`  outer=[${outerPids.join(",")}] inner=[${innerPids.join(",")}] legs=[${legPids.join(",")}]`);
  console.log(`  touchesDex=${touches}`);

  if (swaps.length > 0) {
    for (const s of swaps) {
      const inAmt = Number(s.inputAmount) / 10 ** s.inputDecimals;
      const outAmt = Number(s.outputAmount) / 10 ** s.outputDecimals;
      console.log(
        `  ✅ ParsedSwap: ${inAmt.toFixed(6)} ${s.inputMint.slice(0, 8)}... → ${outAmt.toFixed(6)} ${s.outputMint.slice(0, 8)}...`,
      );
      console.log(`     dex=${s.dex} pool=${s.pool.slice(0, 40)}...`);
    }
  } else if (touches) {
    console.log(`  ⚠️  touchesDex=true but parseHeliusTxToSwaps returned [] — parser failed`);
  } else {
    console.log(`  ⏭️  skipped — no tracked DEX program found`);
  }
  console.log();
}
