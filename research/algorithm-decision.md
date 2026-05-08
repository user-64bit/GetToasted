# Sandwich Detector Algorithm Decision

Date: 2026-05-06
Phase: 1 research only
Status: Awaiting human review before Phase 2

## Executive Decision

Adopt a hybrid multi-signal detector whose primary signal is the a-guard coin-flow method: two attacker transactions in the same slot, on the same attacked mint, with matching raw token-flow magnitude. Then require victim evidence between those two transactions before emitting a detection.

Bundle membership and adjacency are strong confidence boosters, but they are not sufficient alone. Known-bot and validator evidence should boost or explain a detection, not replace the kinetic coin-flow and victim-in-the-middle checks.

## 1. Simplest Robust Signal

The strongest signal is exact attacker inventory round trip:

1. Parse each relevant block into transaction indices, signers/fee payers, token balance deltas, pool/vault accounts, and swap legs.
2. Build candidate attacker round trips by grouping transaction deltas by `slot`, `attackedMint`, canonical attacker identity, and absolute raw token amount.
3. Keep pairs where the attacker receives `X` of a mint in the front leg and later spends exactly `X` of the same mint in the back leg.
4. Search only between those two transaction indices for victim swaps touching the same mint and, when available, the same pool/vaults.
5. Require the victim signer to differ from the attacker and the victim swap direction to align with the front-run direction.

This makes the classifier O(n) to O(n log n) per block after parsing, instead of an O(n^3) `(front, victim, back)` search. It also avoids brittle direction-only matching.

Confidence defaults:

- Same Jito bundle plus coin-flow/victim checks: `0.95`
- Adjacent front/victim/back plus coin-flow checks: `0.90`
- Same-slot non-adjacent coin-flow, same pool, strong victim direction: `0.78`, capped at `0.79` unless known-bot or validator evidence is present.
- Same-slot non-adjacent plus known bot or malicious validator evidence: `0.82`
- Statistical/cross-slot candidate: `0.55` to `0.70`

## 2. Wide and Blind Sandwiches

Tight sandwiches are same-bundle or adjacent-index triples. These should become confirmed detections when coin-flow and victim checks pass.

Wide same-slot sandwiches are non-adjacent. Do not require Jito bundle membership, because direct validator/private mempool sandwiches may not have it. Instead require:

- front index < victim index < back index in the same slot
- exact attacker coin-flow match on the attacked mint
- victim touches the same pool/vaults, or same mint plus a strong program-specific swap match
- victim signer is not the attacker
- no self-sandwich or pure-arb filter hit

Wide detections must remain `suspected` unless known-bot or validator evidence raises confidence to `0.80` or higher. Pure-statistical wide sandwiches are capped at `0.79`, even when their same-slot/pool/mint evidence is strong, because the UI treats `0.80+` as confirmed.

Cross-slot sandwiches are v1 edge cases only. Limit the search to `S` and `S+1`, require exact coin-flow, same pool/mint, and either consecutive leader control or known-bot evidence. Anything broader than one adjacent slot is too false-positive-prone for MVP.

## 3. Loss Calculation

Use a hybrid loss model:

1. `cpmm-reconstruction` for Raydium v4/CPMM, Orca classic, and other constant-product pools where reserves and fees are known.
   - Take pool reserves from the front-run transaction's pre-state.
   - Simulate the victim swap without the front-run.
   - Compare simulated output with actual victim output.
   - This is the highest-quality user loss number.

2. `backrun-proxy` for CLMMs, bonding curves, and exotic AMMs until pool-specific math is implemented.
   - Compute attacker quote-token profit from back-run quote output minus front-run quote input, minus Jito tip and fees when measurable.
   - Convert that profit token to USD at the slot/hour.
   - Treat this as an approximation of victim loss, not a counterfactual output calculation.

3. `failed-backrun-slippage` for partial or unbundled cases.
   - If front and victim landed but the back-run failed or was unbundled, do not report normal attacker profit.
   - Prefer CPMM counterfactual if the pool supports it; otherwise mark low confidence.

USD denomination must be explicit. If the price oracle has no price for a memecoin, display token loss with USD unknown. Never convert missing price data to `$0`.

The production `LossCalculation` shape should be:

```ts
export interface LossCalculation {
  method: "cpmm-reconstruction" | "backrun-proxy" | "failed-backrun-slippage";
  confidence: number;

  victimActualOutput: string | null;
  victimCounterfactualOutput: string | null;
  lossInOutputToken: string | null;
  outputTokenMint: string;
  outputTokenDecimals: number;

  lossInProxyToken: {
    amount: string;
    mint: string;
    usdPrice: number | null;
  } | null;

  lossUsd: number | null;
  outputTokenPriceAtSlot: number | null;
  notes: string | null;
}
```

For `cpmm-reconstruction`, `lossInOutputToken` should be populated. For `backrun-proxy`, `lossInOutputToken` and `outputTokenPriceAtSlot` may be null while `lossInProxyToken` carries the attacker-profit proxy token, commonly SOL. `notes` is required whenever the method is proxy or partial, for example: "back-run reverted, loss estimated from front-run slippage only".

## 4. False Positives and Filters

Pure arbitrage:
- Drop if there is no victim swap between front/back in the same pool.
- Drop if the bot's legs touch different pools and the middle transaction is not harmed in the same pool.
- Drop single-transaction atomic arbitrage unless a separate victim is bracketed.

Self-sandwich:
- Drop if victim signer, fee payer, token owner, or known controlling authority overlaps the attacker entity.
- Drop if all legs are part of one user's route or automation.

Jupiter route side effects:
- Classify at the inner-swap/pool level, not whole transaction level.
- If only one hop is sandwiched, compute loss only for that attacked leg.
- Do not treat multi-hop route balancing as a victim unless a separate attacker round trip brackets it.

Failed back-run:
- Do not call it confirmed if the attacker never completed inventory disposal.
- Mark suspected only when front-run worsened the victim and the failed back-run evidence is clear.

JIT liquidity / LP patterns:
- Drop add-liquidity -> swap -> remove-liquidity shapes unless there is a swap round trip with exact attacker token-flow symmetry.
- Watch for LP token/account changes to avoid confusing liquidity provision with a sandwich.

## 5. Data Flow and Credit Estimate

For wallet `W`:

1. Discover wallet activity with Solana `getSignaturesForAddress` for `W`, paginating through the `before` cursor. Keep signature, slot, status, and block time. For MVP, filter failed transactions unless explicitly analyzing failed-backrun edge cases.
2. Group the wallet signature set by slot.
3. For each unique slot, load `getBlock` from the Postgres `block_cache`; on miss, fetch `getBlock` with `transactionDetails: "full"`, `maxSupportedTransactionVersion: 0`, and store forever because block data is immutable.
4. Identify wallet swaps inside the block parser by matching each block transaction signature against the wallet signature set. The block transaction array index is the source of truth for `txIndex` and adjacency.
5. Enrich each block into parsed swap legs, token balance deltas, pool/vault identities, signers, fee payers, Jito tip transfers, and transaction indices.
6. Run classifiers in priority order, with bundle matching internally requiring sandwich-shaped token/victim evidence.
7. Query Jito Explorer REST only for candidate detections or nearby likely bundle signatures, and cache signature -> bundle for 7 days in Redis.
8. Calculate loss, denominate via price cache, attribute leader/validator from cached epoch leader schedule, then stream progress.

We deliberately do not depend on Helius `getTransactionsForAddress`. It is paywalled, it does not replace `getBlock` because coin-flow detection requires full same-slot attacker/victim context, and parsing block transactions ourselves gives us full control over swap extraction across all DEXes. That matters for protocols that generic enhanced parsers lag on or partially miss, especially newer Pump.fun variants and Meteora DAMM v2.

Credit estimate for a 1,000-transaction wallet:

- `getSignaturesForAddress`: one request per up to 1,000 signatures = 1 credit for a 1,000-transaction wallet.
- `getBlock`: one request per unique slot = 1 credit per cold-cache slot. A 1,000-transaction wallet is not necessarily 1,000 unique slots once token-account and repeated activity are de-duplicated, but use 1,000 as the conservative base.
- Candidate/bundle/loss enrichment: assume up to roughly 2,500 additional RPC credits for neighbor-slot edge checks, price-support probes that hit Helius, occasional transaction spot checks, and retry/rate-limit overhead in the cold path.
- Cold cache estimate: about 3,500 Helius credits for a 1,000-transaction wallet.
- Warm block cache estimate with roughly 70% block-cache hits: about 1,000 Helius credits, dominated by 300 cold block misses plus discovery/enrichment overhead.
- Jito REST and Jupiter price calls do not consume Helius credits, but still need rate limiting and caching.

This remains under the requested 7,500 cold-cache target. The main cost control is immutable block caching; without it, repeated scans of active wallets would waste credits.

## Sources Read

- sandwiched.me State of Solana MEV: https://sandwiched.me/research/state-of-solana-mev-may-2025-analysis
- Helius Solana MEV Report: https://www.helius.dev/blog/solana-mev-report
- a-guard/malicious-validators: https://github.com/a-guard/malicious-validators
- Joel Obafemi B91 case study: https://medium.com/@joel_28760/breaking-down-mev-sandwich-attacks-on-solana-the-b91-bot-case-study-3e1c1ba35556
- Jito docs: https://docs.jito.wtf/lowlatencytxnsend/
- Jito Explorer: https://explorer.jito.wtf/
- Helius Enhanced Transactions docs: https://www.helius.dev/docs/api-reference/enhanced-transactions/gettransactionsbyaddress
- Jito DontFront guide: https://solana.com/developers/guides/advanced/mev-protection
