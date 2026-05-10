# Sandwich Detector Validation Report

Last regenerated: 2026-05-08.

## Status

**100% match rate (30/30)** on Jito-bundle-confirmed sandwiches across
the diversification corpus. Plus **3/3 wallets pass the production
end-to-end smoke test** (API → BullMQ → worker → Postgres → SSE-equivalent
polling). Production-ready by every measure we have.

## Validation strategy

Sandwiched.me has no per-victim-wallet route — don't waste time
scraping it. Validation primary ground truth is **Jito bundle
membership**, mined mechanically:

1. `pnpm harness mine-from-known-bots --bots <signer> --limit N --scan-limit M`
   walks a known-bot signer's recent signatures, queries
   `bundles.jito.wtf/api/v1/bundles/transaction/{sig}` for each, and
   any 3-tx sandwich-shape bundle yields a (victim wallet, slot, victim
   sig) ground-truth tuple.
2. `pnpm harness validate-mined <jsonPath>` runs the production detector
   (`detectSandwichesForWalletSwaps` from `@get-toasted/core`) against
   each mined ground-truth tuple, expanding the slot via the production
   block-expander pipeline.

Wide non-bundled (L4 statistical) sandwiches are out of scope for
automated validation — they require manual spot-check against Solana
Explorer.

## Results — final corpus (30 wallets)

`pnpm harness validate-mined research/mined-victims/known-bots-2026-05-08T10-17-29-533Z.json`

| | Count |
|---|---:|
| Wallets validated | 30 |
| Detected at L1 confidence 1.00 | 30 |
| Detected at any layer | 30 |
| Missed | 0 |
| **Match rate** | **100%** |

All 30 attacks come from the B91 cluster signer
`4vJfp62jEzcYFnQ11oBJDgj6ZFrdEwcBBpoadNTpEWys` on Raydium AMM v4,
spanning slots 361929528–362686298 (~12 days of B91 bundle activity).

### Corpus skew (acknowledged)

Diversification mining against `Ai4zqY7g…` (arsc-active) returned 0
victims at scan-limit 1000; `BCbrpBp…` (arsc-warm) returned 0
signatures from gSFA. Both arsc-cluster bots appear dormant. The B91
cluster is the only active sandwich-bundling traffic surfaced through
the Jito public REST endpoint. **Recall against B91-style sandwiches is
100%; recall against a future bot family with different shape
characteristics is unmeasured by this corpus.** This is a real
limitation, called out in `SUBMISSION.md`.

## Production end-to-end smoke (3 wallets)

`scripts/smoke-test-api.ts` triggers a real `POST /api/v1/wallets/:addr/scan`
and verifies the full pipeline lands rows in `detected_sandwiches`.

| Wallet | Detections | Layers | Notes |
|---|---:|---|---|
| `8UE2QGDJcpBp1PPjuCz3EsDtJn3wzSaPsmpVYXGRbzC7` | 3 | L1 ×3 | All cpmm-reconstruction → backrun-proxy fallthrough (CPMM sanity guard) |
| `5poWTd4YXSDmxGSMtoomWd4BMrAhpEevRpMWWiiAyqRL` | 1 | L2 ×1 | cpmm-reconstruction confidence 1.00 |
| `9tJEZ98XuDTybkaijxnnFUomcWaLEjuAh8Q1d4HusYc3` | 2 | L1 ×2 | cpmm-reconstruction confidence 1.00 |

For each wallet:
- Persisted to `detected_sandwiches` with non-default
  `detection_layer`, `confidence`, `loss_method`, `loss_confidence`.
- `loss_output_amount > 0` (CPMM sanity guard fix verified).
- `loss_usd` populated via SOL-denominated fallback when output token
  has no Jupiter oracle (long-tail Pump.fun mints).
- Live progress emitted to `scan:progress:{wallet}` Redis key.
- Idempotent re-scan via `(victim_sig, front_sig, back_sig)` unique
  constraint.

## Bugs fixed during validation

1. **Guard 2b applied across all layers (10/10 was 9/10 pre-fix).** The
   relative-loss < 0.1% post-filter was dropping Jito-confirmed L1
   detections that extracted < 0.1% from large-trade memecoin victims.
   That filter is statistical noise removal — only meaningful at L4.
   Fix: gated on `detection.layer === "L4"`. New unit test covers
   L1/L2/L3 admitting low-extraction cases.
2. **CPMM inverted-counterfactual bug (`loss_usd: $0` on confirmed
   sandwiches).** `inferPoolReservesFromTx` occasionally picks a
   non-pool token account when multiple non-signer balances of the
   same mint are in the tx, producing reserves where the CPMM math
   computes `counterfactual < actual`. Pre-fix: clamped to zero loss.
   Post-fix: sanity guard in `reconstructCpmmLoss` falls through to
   `backrun-profit-proxy` (lossConfidence 0.85). Detection is
   unaffected; only the loss-method / confidence column changes.
3. **Jupiter Price API v2 endpoint dead.** Migrated `pricing-cache.ts`
   to v3 (`lite-api.jup.ag/price/v3`) with the new response shape
   (top-level keyed by mint, `usdPrice` field).
4. **Memecoin loss showed as `$0`.** Output-token USD is null for
   long-tail Pump.fun mints. Added a SOL-denominated fallback in
   `detection-enricher.ts`: when output-token price is null and the
   input side is SOL, derive lossUsd from `attacker_profit_raw × SOL
   price`. Memecoin sandwiches now show real money instead of `$0`.

## Out of scope for this validation

- **L4 false-positive rate** — no automated ground truth exists for
  wide non-bundled sandwiches. Spot-check protocol documented in
  `DETECTOR.md`.
- **L5 cross-slot sandwich** — intentionally not enabled per algorithm
  spec §13.
- **Phoenix Eternal (perpetuals AMM)** — untracked in v1; v2 work in
  `BACKLOG.md`.
- **Diverse attacker recall** — corpus is B91-only; see "Corpus skew"
  above.

## Reproduce

```bash
# Mine 30 ground-truth sandwiches from B91's recent activity.
# Writes research/mined-victims/known-bots-<ts>.json.
pnpm harness mine-from-known-bots \
  --bots B91piBSfCBRs5rUxCMRdJEGv7tNEnFxweWcdQJHJoFpi \
  --limit 30 --scan-limit 2000

# Validate every mined sandwich against the production detector.
# Writes research/validation-runs/mined-validation-<ts>.json.
pnpm harness validate-mined research/mined-victims/known-bots-<ts>.json

# End-to-end production scan-path smoke (requires API + worker running).
MAX_SCAN_DURATION_MS=600000 pnpm --filter worker-scanner dev   # terminal A
pnpm --filter api dev                                           # terminal B
pnpm tsx scripts/smoke-test-api.ts                              # terminal C
```
