import "dotenv/config";
import fetch from "node-fetch";
import { TRACKED_DEX_PROGRAM_ID_SET } from "@get-toasted/core";

async function main() {
  const KEY = process.env.HELIUS_API_KEY;
  const SLOT = 417918024;
  const ANCHOR_SIG = "4d3ymUhq4zCUTphsoZWHrv2zLvUf4Y5yHe4SwPyiNaWzSVFYpWzyG1DMuVYm9nRrNRP1Hkgvo99ikAdLYBvKN6DE";

  console.log(`Fetching block ${SLOT}...`);
  const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getBlock",
      params: [
        SLOT,
        {
          encoding: "jsonParsed",
          transactionDetails: "full",
          maxSupportedTransactionVersion: 0,
          rewards: false,
        },
      ],
    }),
  });
  const block = (await res.json()).result;
  const txs = block.transactions || [];

  // Find anchor tx
  const anchorTx = txs.find(t => t.transaction.signatures[0] === ANCHOR_SIG);
  if (!anchorTx) throw new Error("Anchor not found");

  // Get anchor accounts
  const anchorAccounts = new Set<string>();
  for (const acc of anchorTx.transaction.message.accountKeys) {
    const pubkey = typeof acc === "string" ? acc : acc.pubkey;
    // skip common programs
    if (![
      "11111111111111111111111111111111",
      "ComputeBudget111111111111111111111111111111",
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
      "SysvarRent111111111111111111111111111111111",
      "So11111111111111111111111111111111111111112",
      "So11111111111111111111111111111111111111112",
      "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA", // Pump program itself
    ].includes(pubkey)) {
      anchorAccounts.add(pubkey);
    }
  }
  
  // also get mints from token balances
  for (const tb of [...(anchorTx.meta?.preTokenBalances||[]), ...(anchorTx.meta?.postTokenBalances||[])]) {
    anchorAccounts.add(tb.mint);
  }

  console.log(`Anchor accounts to intersect: ${anchorAccounts.size}`);
  
  let allDexCount = 0;
  let intersectedCount = 0;
  const intersectedSigs = [];

  for (const tx of txs) {
    const meta = tx.meta || {};
    const msg = tx.transaction.message || {};
    const outer_pids = msg.instructions?.map(ix => ix.programId) || [];
    const inner_pids = meta.innerInstructions?.flatMap(grp => grp.instructions.map(inn => inn.programId)) || [];
    
    const touchesDex = outer_pids.some(p => TRACKED_DEX_PROGRAM_ID_SET.has(p)) || 
                       inner_pids.some(p => TRACKED_DEX_PROGRAM_ID_SET.has(p));
                       
    if (touchesDex) {
      allDexCount++;
      let intersects = false;
      const txAccounts = new Set<string>();
      for (const acc of msg.accountKeys || []) {
        txAccounts.add(typeof acc === "string" ? acc : acc.pubkey);
      }
      for (const tb of [...(meta.preTokenBalances||[]), ...(meta.postTokenBalances||[])]) {
        txAccounts.add(tb.mint);
      }
      
      for (const acc of anchorAccounts) {
        if (txAccounts.has(acc)) {
          intersects = true;
          break;
        }
      }
      
      if (intersects) {
        intersectedCount++;
        intersectedSigs.push(tx.transaction.signatures[0]);
      }
    }
  }

  console.log(`Total DEX txs in block: ${allDexCount}`);
  console.log(`DEX txs intersecting anchor accounts: ${intersectedCount}`);
  console.log(`Sigs:`, intersectedSigs);
}

main().catch(console.error);
