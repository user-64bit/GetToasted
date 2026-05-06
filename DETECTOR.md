# GetToasted — Sandwich Detector

A layered classifier for detecting sandwich attacks against a Solana wallet.
Built to replace an O(n³) sliding-window detector that produced false
positives on arbitrage triplets and missed Jupiter-routed multi-hop victims.

## How a detection happens

Every wallet swap is treated as a *victim candidate*. The pipeline:

1. **Block expansion** — `@get-toasted/runtime/block-expander` pulls the
   slot's full block via `getBlock(transactionDetails: 'full')`, then asks
   Helius enhanced to parse every tracked-DEX tx in the block within ±25
   positions of the wallet's own tx (anchor-window narrowing). Output is a
   `ParsedSwap[]` ordered by true `txIndexInBlock`, plus best-effort
   `poolReservesBefore`/`poolReservesAfter` extracted from
   `meta.preTokenBalances`/`postTokenBalances`. Cached in Redis for 14 days
   (finalized blocks are immutable).
2. **Layered classification** — `@get-toasted/core/detectSandwichForVictim`
   runs the layers in order, short-circuiting at the first match.
3. **Loss math** — `@get-toasted/core/computeLoss` picks a method based on
   pool type and data availability.
4. **Post-filters** — `@get-toasted/core/passesPostFilters` drops
   self-sandwiches and statistical-noise loss numbers.
5. **Enrichment** — `@get-toasted/runtime/enrichSandwichDetection` resolves
   validator vote account, denominates loss in USD, and produces the row
   shape consumed by `Sandwiches.batchInsertDetections`.

## The layers

| Layer | Signal | Confidence | Status | Detects |
|---|---|---|---|---|
| L1 | *(disabled — see below)* Jito bundle membership: front + victim + back co-bundled | 1.00 | confirmed | Tight bundled sandwiches (when enabled) |
| L2 | Nearest same-pool neighbor: front + victim + back form an A→B→A shape with same f+b signer, back sells ≥95% of front output | 0.95 | confirmed | All tight sandwiches (bundled + validator-direct) |
| L3 | Same-slot, known-bot signer (KNOWN_SANDWICH_BOTS), A→B→A, back sells ≥90% | 0.85 | confirmed | Bot-attributed sandwiches with non-adjacent legs |
| L4 | Same-slot statistical match: any signer, same pool, 5 false-positive guards | 0.65 | suspected | Wide / blind sandwiches by unknown bots |
| L5 | *(not enabled)* Cross-slot, known-bot, multi-pool route | 0.55 | suspected | Jupiter route victims across adjacent slots |

**L1 status (Jito):** Jito does not publish a public REST endpoint for
`signature → bundle` reverse lookup. Their docs only expose
`getBundleStatuses` (requires the bundle id, which we don't have) and a
5-minute in-flight window. Until a paid indexer ships
(Helius MEV API, sandwiched.me, Ghostlogs, or a Jito Block Engine
subscription), L1 is a no-op stub that always returns null. The
orchestrator falls through to L2; tight bundled sandwiches are still
detected (Jito bundles land contiguously, so L2's nearest-neighbor
rule catches them), and the bundled-vs-direct distinction is
approximated by tip-transfer presence on the front/back swap (parser
already extracts `jitoTipLamports` from native transfers to known tip
accounts).

**L2 — nearest-neighbor adjacency, not strict.** The original spec
required `victim.txIndex ± 1` against the absolute block index. That
misses real sandwiches when a tip-transfer system tx (or any non-DEX
tx) interleaves the bundle's swaps in the block's tx list. L2 instead
finds the closest preceding and closest following same-pool same-signer
candidates, ignoring non-DEX txs entirely. Confidence stays at 0.95
because the shape predicate (same pool, same f+b signer, reversed
direction) plus the 95% sell-through tolerance band already eliminate
the false-positive surface — the relaxation widens *which* sandwiches
we catch, not *what we count as one*.

**L3 — known-bot fallback.** When L2's nearest-neighbor walk fails (too
many same-pool swaps between the bot's legs, or the legs are >2 positions
apart), L3 searches explicitly for known bot signers. Uses `KNOWN_SANDWICH_BOTS`
from `packages/core/src/known-bots.ts`. Relaxes sell-through tolerance to 90%.

**L4 — statistical wide sandwich.** Unknown bots, same block. Requires:
- Sell-through ≥85%
- Non-negative proxy profit (`back.output ≥ front.input`)
- Front size ratio 0.05×–25× victim
- Index proximity ≤20 positions front-to-victim and victim-to-back

All five filters must pass. Marked `status: 'suspected'` in the UI.

## Loss methods

Picked automatically by `computeLoss` per the spec's decision tree:

| Method | When | Confidence |
|---|---|---|
| `cpmm-reconstruction` | CPMM pool (Raydium v4, Raydium CPMM, Orca classic, Meteora classic, PumpSwap) AND `poolReservesBefore` is available | 1.00 |
| `backrun-profit-proxy` | All other profitable sandwiches (CLMM, missing reserves) | 0.85 |
| `failed-backrun-slippage` | Bot's back-run reverted or sold less than it bought (`back.outputAmount ≤ front.inputAmount`) | 0.50 |

Loss confidence is **distinct from detection confidence**: an L1 detection
(confidence 1.00) on a CLMM pool will report loss confidence 0.85 because
CPMM math doesn't apply.

USD denomination via Jupiter Price API v3 — long-tail mints with no price
data return `lossUsd: null`. The UI surfaces this as
"≈X TOKEN (USD unknown)" rather than `$0`.

## Adding a new known-bot signer

Edit `packages/core/src/known-bots.ts`:

```ts
{
  address: "<base58 wallet pubkey>",
  name: "<short label>",
  confidence: 1.0,
  isProgram: false,           // true if it's a deployed program, not a wallet
  source: "manual",           // mrgn_research | helius_report | ghostlogs | sandwiched_me | manual
  notes: "Why we trust this attribution",
}
```

The list is hot-path data; we keep it in code so L3 doesn't pay a DB
lookup per swap. Refresh quarterly by checking
[sandwiched.me's leaderboard](https://sandwiched.me/sandwiches).

## Known bots (seed list)

| Address (truncated) | Name | Source |
|---|---|---|
| `9973hWbc...` | arsc-cold | MarginFi research |
| `Ai4zqY7g...` | arsc-active | MarginFi research |
| `BCbrpBpt...` | arsc-warm | MarginFi research |
| `B91piBSf...` | B91 (program) | Helius MEV report |
| `vpeNALD8...` | vpe-bot | Helius MEV report |

These five addresses cover a large fraction of historical sandwich volume
on Solana per sandwiched.me's public dataset.

## Test fixtures

Phase 1 ships with synthetic-shape fixtures embedded in unit tests
(`packages/core/src/detector*.test.ts`). Real-attack regression fixtures
from sandwiched.me are tracked in `tests/fixtures/real-sandwiches/` and
populated via a one-shot fetch script (TODO — requires Helius API key).

The synthetic tests cover:

- L1 hit / miss / dontfront-as-index-0 / sandwich-shape-violation
- L2 adjacency / non-adjacency / size-tolerance band
- CPMM reconstruction with and without reserves
- Back-run profit proxy with and without Jito tip subtraction
- Failed-backrun slippage estimate
- Post-filter self-sandwich + negligible-loss guards
- End-to-end block-expander → layered detector

## Bug fixes shipped in this session (root cause of "You're clear" false negatives)

**Bug 1 — Jupiter swaps not identified as DEX candidates in the scanner:**
`walletTxTouchesTrackedDex` only checked `tx.instructions` + `innerInstructions`.
For Jupiter routes, the outer instruction is the Jupiter aggregator (untracked);
the real DEX calls happen in `events.swap.innerSwaps` which the scanner was not
checking. Result: Jupiter-routed victim slots were **never added to `candidateSlots`**
→ never block-expanded → never run through the detector. Fixed in
`apps/workers/scanner/src/index.ts` by also checking `events.swap.innerSwaps`.

**Bug 2 — Narrow block window (±10) silently dropped bot swaps:**
The block expander parsed only swaps within ±10 positions of the victim's
tx. Bot front-runs >10 positions away were invisible to L2. Common in
validator-direct attacks. Fixed in `packages/runtime/src/block-expander.ts`:
window expanded to ±25. Still a small fraction of a 400-tx block; per-slot
credit cost unchanged.

**Bug 3 — `zeroLoss` helper set `lossUsd: 0` → Guard 2a dropped real detections:**
When loss math failed (CPMM mint mismatch, rate-delta sign reversal on noisy bot
data), `zeroLoss` returned `lossUsd: 0`. Guard 2a (`lossUsd < $0.01 → drop`)
then discarded the detection even though it was a real sandwich. Fixed in
`packages/core/src/detector-loss.ts`: `zeroLoss` now returns `lossUsd: null`
("unknown, skip the USD guard"). Guard 2b also updated to skip the ratio
check when `lossConfidence === 0`.

**Bug 4 — L3 and L4 not wired into the orchestrator:**
The orchestrator only ran L1 and L2. Known-bot (L3) and statistical (L4)
detection were implemented in the spec but never enabled. Fixed in
`packages/core/src/detector.ts`: L1 → L2 → L3 → L4 pipeline now active.

**Bug 5 — Missing known bots in the registry:**
`vpe-bot` (DeezNode/vpe family, Helius report: ~50% of all attacks) and
`arsc-warm` were in the spec's §11 but missing from the implementation.
Fixed in `packages/core/src/known-bots.ts`.

## What changed in the database

Migration `0003_layered_detector.sql` adds three new columns to
`detected_sandwiches`:

- `detection_layer text NOT NULL DEFAULT 'legacy'` — which layer fired
  (`L1` | `L2` | … | `L5` | `legacy` for pre-rewrite rows)
- `loss_method text` — `cpmm-reconstruction` | `backrun-profit-proxy` |
  `failed-backrun-slippage` (nullable for legacy rows)
- `loss_confidence numeric(3,2)` — 0.50 / 0.85 / 1.00 (nullable for legacy)
- `loss_output_amount numeric(40,0)` — loss in output-token base units
  (so the UI can render long-tail-mint losses without USD denomination)
- New index `idx_detection_layer (detection_layer, block_time)` so the
  dashboard can filter "confirmed only" cheaply.

Backfill: existing rows get `detection_layer = 'legacy'` and the other
columns null. Run once via `pnpm --filter @get-toasted/db migrate`.

## Where things live

```
packages/core/
  src/types.ts                # ParsedSwap (extended with poolReserves), Dex, PoolType
  src/detector-types.ts       # SandwichDetection, LayerMatch, LossCalculation, JitoBundleResolver
  src/detector.ts             # detectSandwichForVictim + detectSandwichesForWalletSwaps (orchestrator)
  src/detector-l1.ts          # Jito-bundle layer + isSandwichShape predicate
  src/detector-l2.ts          # Block-adjacency layer
  src/detector-l3.ts          # Known-bot same-slot layer (NEW)
  src/detector-l4.ts          # Statistical wide-sandwich layer (NEW)
  src/detector-loss.ts        # computeLoss dispatcher + 3 reconstruction methods
  src/detector-filters.ts     # passesPostFilters
  src/dex-fees.ts             # Per-DEX fee bps + pool type table
  src/known-bots.ts           # KNOWN_SANDWICH_BOTS registry
packages/runtime/
  src/block-expander.ts       # getBlock + parseTransactions + reserves extraction
  src/jito-bundle.ts          # JitoBundleClient with Redis cache (impl of JitoBundleResolver)
  src/detection-enricher.ts   # SandwichDetection → SandwichInsert (DB row)
apps/workers/scanner/         # Historical scan worker (uses pipeline)
apps/workers/detector/        # Realtime webhook-triggered worker (uses pipeline)
```

## Operational notes

- **Helius credit budget**: a 1,000-swap wallet scan costs ~5,000 credits
  (gTFA + getBlock per unique slot). With Developer-tier 10M credits/mo,
  that's ~2,000 wallet scans per month. Scanner worker hard-caps at
  `MAX_SCAN_SIGNATURES` and `MAX_SCAN_SLOTS` per wallet; tune via env.
- **Jito API rate limit**: 5 RPS unauthenticated, 50 RPS with key. Redis
  cache (7-day TTL on hits, 1-hour on misses) keeps sustained rate well
  under both limits even at heavy scan throughput.
- **Block cache**: keyed by `slot:swaps:{slot}` in Redis, 14-day TTL.
  Wallet rescans and cross-wallet scans touching the same slot pay zero
  additional credits.
- **Failure mode**: Jito API hiccup → L1 returns null → orchestrator
  falls through to L2/L3/L4. Helius transient error during block expansion →
  expander logs and returns `[]`; scanner treats as no-detection and
  continues with other slots. Both paths are fail-closed for accuracy
  rather than fail-open with phantom detections.

## Rolling out L5

Per spec §13: ship L1-L4 (done), validate false-positive rate against
sandwiched.me for ≥1 week, then enable L5 (cross-slot wide sandwich) in a
separate PR. L5 is the noisiest layer; enabling it before L4 is validated
risks flooding the DB with suspected-status noise that the UI can't distinguish
from real attacks.

