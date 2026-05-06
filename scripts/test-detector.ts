import "dotenv/config";
import { HeliusClient } from "@get-toasted/helius";
import { parseHeliusTxToSwaps } from "@get-toasted/helius";
import { detectSandwichesForWalletSwaps } from "@get-toasted/core";
import { createBlockExpander } from "@get-toasted/runtime";
import Redis from "ioredis";

const WALLET = "CWy9qYxwFmCSr3foPDt84f9iwEcTi3BV9BiJtAi5ZFc1";
const HELIUS_KEY = process.env.HELIUS_API_KEY;

const client = new HeliusClient(HELIUS_KEY!);

async function main() {
  const txs = await client.getTransactionsForAddress({ address: WALLET, limit: 50 });
  const swapTx = txs.find(t => t.signature.startsWith("5zq6FCUhkV8v3VKXxvKXNUr6XhMp"));
  if (!swapTx) throw new Error("Swap not found");

  const walletSwaps = parseHeliusTxToSwaps(swapTx, { txIndexInBlock: 2 });
  console.log("Wallet ParsedSwaps:");
  console.dir(walletSwaps, { depth: null });
  
  const redis = new Redis("redis://localhost:6379");
  const expander = createBlockExpander({ redis, helius: client });
  
  const blockSwaps = await expander.getBlockSwaps(BigInt(swapTx.slot), {
    anchorSigs: [swapTx.signature]
  });
  console.log("Block swaps length: ", blockSwaps.length);
  const mint = walletSwaps[0]!.outputMint;
  const sameMintSwaps = blockSwaps.filter(s => s.inputMint === mint || s.outputMint === mint);
  console.log(`Same mint swaps (${sameMintSwaps.length}):`);
  for (const s of sameMintSwaps) {
    console.log(`[Idx ${s.txIndexInBlock}] signer=${s.signer.slice(0,8)} in=${s.inputAmount}(${s.inputMint.slice(0,4)}) out=${s.outputAmount}(${s.outputMint.slice(0,4)}) pool=${s.pool.slice(0,10)} dex=${s.dex}`);
  }
  
  const detections = await detectSandwichesForWalletSwaps({
    wallet: WALLET,
    walletSwaps,
    blockSwaps,
    jito: { getBundleForTx: async () => null }
  });
  
  console.log(`\nFound ${detections.length} detections:`);
  console.dir(detections, { depth: null });
  redis.disconnect();
}

main().catch(console.error);
