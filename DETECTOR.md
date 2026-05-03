# GetToasted — Sandwich Detector

A layered classifier for detecting sandwich attacks against a Solana wallet.
Built to replace an O(n³) sliding-window detector that produced false
positives on arbitrage triplets and missed Jupiter-routed multi-hop victims.

## How a detection happens

Every wallet swap is treated as a *victim candidate*. The pipeline:

1. **Block expansion** — `@get-toasted/runtime/block-expander` pulls the
   slot's full block via `getBlock(transactionDetails: 'full')`, then asks
   Helius enhanced to parse every tracked-DEX tx in the block. Output is a
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
| L3 | *(not enabled)* Same-slot, known-bot signer, A→B→A | 0.85 | confirmed | Bot-attributed wide sandwiches |
| L4 | *(not enabled)* Same-slot statistical match, unknown signer | 0.65 | suspected | Wide / blind sandwiches |
| L5 | *(not enabled)* Cross-slot, known-bot, multi-pool route | 0.55 | suspected | Jupiter route victims |

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

The list is hot-path data; we keep it in code so the L3 detector (when
enabled) doesn't pay a DB lookup per swap. Refresh quarterly by checking
[sandwiched.me's leaderboard](https://sandwiched.me/sandwiches).

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
  falls through to L2. Helius transient error during block expansion →
  expander logs and returns `[]`; scanner treats as no-detection and
  continues with other slots. Both paths are fail-closed for accuracy
  rather than fail-open with phantom detections.

## Rolling out the lower layers

Per spec §13:

1. Ship L1 + L2 (this PR). Run on a pool of test wallets, eyeball
   detections against sandwiched.me ground truth.
2. Add L3 (known-bot relaxed adjacency). Re-run, compare false-positive
   rate.
3. Add L4 (statistical wide). All L4 detections should write
   `status = 'suspected'`; the UI must visually distinguish
   confirmed-vs-suspected.
4. Add L5 (cross-slot) only when L4's false-positive rate is < 10%.
