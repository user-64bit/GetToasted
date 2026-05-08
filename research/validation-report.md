# Sandwich Detector Validation Report

Generated: 2026-05-08T10:01:18Z (supersedes the 2026-05-07 report)

## Status

**100% match rate on Jito-bundle-confirmed sandwiches (10/10).** Brief's > 90%
threshold cleared. Ready to ship per the user's path-forward criterion.

## Validation strategy

Per the 2026-05-08 reframe (saved as memory: `project_validation_strategy.md`),
sandwiched.me has no per-victim-wallet route. Validation primary ground truth
is now **Jito bundle membership**, mined mechanically:

1. `pnpm harness mine-from-known-bots --bots <signer> [--limit N] [--scan-limit M]`
   walks a known-bot signer's recent signatures, queries Jito's
   `bundles/transaction/{sig}` for each, and any 3-tx sandwich-shape bundle
   yields a (victim wallet, slot, victim sig) ground-truth tuple.
2. `pnpm harness validate-mined <jsonPath>` runs the production detector
   (`detectSandwichesForWalletSwaps` from `@get-toasted/core`) against each
   mined ground-truth tuple, expanding the slot via the production block-
   expander pipeline. Reports detected/missed per case + aggregate match rate.

Wide non-bundled sandwiches are out of scope for automated validation —
the user spot-checks L4 hits manually against Solana Explorer / Solscan.

## Results

| Wallet | Slot | Attacker | DEX | Detected | Layer | Confidence |
|---|---:|---|---|---|---|---:|
| `8UE2QGDJ…` | 362686298 | `4vJfp62jEz…` (B91) | raydium_amm_v4 | HIT | L1 | 1.00 |
| `29cQt3iR…` | 362640126 | `4vJfp62jEz…` (B91) | raydium_amm_v4 | HIT | L1 | 1.00 |
| `5poWTd4Y…` | 362491853 | `4vJfp62jEz…` (B91) | raydium_amm_v4 | HIT | L1 | 1.00 |
| `9tJEZ98X…` | 362488508 | `4vJfp62jEz…` (B91) | raydium_amm_v4 | HIT | L1 | 1.00 |
| `EZh1E8wJ…` | 362475320 | `4vJfp62jEz…` (B91) | raydium_amm_v4 | HIT | L1 | 1.00 |
| `EBSaUJWF…` | 362384737 | `4vJfp62jEz…` (B91) | raydium_amm_v4 | HIT | L1 | 1.00 |
| `AtUqrGXP…` | 362353099 | `4vJfp62jEz…` (B91) | raydium_amm_v4 | HIT | L1 | 1.00 |
| `yVQvLbkD…` | 362236390 | `4vJfp62jEz…` (B91) | raydium_amm_v4 | HIT | L1 | 1.00 |
| `7xTFbNwu…` | 362236369 | `4vJfp62jEz…` (B91) | raydium_amm_v4 | HIT | L1 | 1.00 |
| `FgupNSpx…` | 362222367 | `4vJfp62jEz…` (B91) | raydium_amm_v4 | HIT | L1 | 1.00 |

**Match rate: 100% (10/10).** All 10 detected at L1 with confidence 1.00.

### Diversification pass (n=30, 2026-05-08)

Re-ran with `--scan-limit 2000` against B91, mining 30 unique victim
wallets across slot range 361929528–362686298 (~12 days of B91 activity).
**Match rate: 100% (30/30)**, all at L1 confidence 1.00.

Tried `Ai4zqY7g…` (arsc-active) and `BCbrpBp…` (arsc-warm) for attacker-
mix diversification: arsc-active mining returned 0 victims even with
`--scan-limit 1000`, and arsc-warm's registry address returns 0
signatures from gSFA. Both arsc-cluster bots appear dormant; the active
sandwich-bundling traffic that's mineable through Jito's REST endpoint
right now is concentrated on B91. This is a real corpus skew worth
acknowledging in the submission notes — recall against B91-style
sandwiches is 100%, but recall against a future bot family with
different shape characteristics is unmeasured by this validation.

## Bug fix shipped during validation

**Bug 6 — Guard 2b dropped Jito-confirmed low-extraction sandwiches.**
Before the fix, match rate was 9/10 = 90%. The 1 miss
(`EBSaUJWFe3YtFMG…` at slot 362384737) was a real B91 sandwich whose
victim trade was 9.13 SOL in size; the bot's profit was ~0.0094 SOL
(~$1.50). That's only 0.06% relative extraction, which tripped
`passesPostFilters` Guard 2b's 0.1% noise filter. Guard 2b is meant for
the statistical L4 layer; applying it to L1/L2/L3 silently drops real
mechanical detections. Fix: gated Guard 2b on `detection.layer === "L4"`.
Match rate after fix: 10/10 = 100%.

Tests updated: `detector-filters.test.ts` `rejects when relative loss < 0.1%`
now asserts on an L4 detection; new test covers L1/L2/L3 admitting.
`detector.test.ts` `drops the detection when loss is below the 0.1% threshold`
renamed to `admits a tight (L2) sandwich even when relative loss is below 0.1%`
with the corresponding inverted assertion.

## What this validation does NOT cover

- **Wide non-bundled sandwiches (L4).** No automated ground truth exists.
  Spot-check protocol is documented in `DETECTOR.md` "Validation strategy".
- **Cross-slot sandwiches (L5).** L5 is intentionally not enabled in v1
  per spec §13.
- **Phoenix Eternal / spline-AMM perpetuals.** Untracked in v1; v2 work
  captured in `BACKLOG.md`.
- **DEX-specific loss-method accuracy.** All 10 hits computed loss via
  `backrun-profit-proxy`; CPMM reconstruction is implemented but not
  exercised in this sample. CPMM accuracy is a separate validation
  question.

## How to reproduce

```bash
# Mine ground truth (writes research/mined-victims/known-bots-*.json)
pnpm harness mine-from-known-bots \
  --bots B91piBSfCBRs5rUxCMRdJEGv7tNEnFxweWcdQJHJoFpi \
  --limit 10 --scan-limit 500

# Validate (writes research/validation-runs/mined-validation-*.json)
pnpm harness validate-mined research/mined-victims/known-bots-<ts>.json
```

## Conclusion

The detector identifies mechanically-confirmed Jito-bundle sandwiches at
100% recall on a 10-wallet sample. Guard 2b layer gating was the only
algorithmic fix required during validation. All other detector behavior
(L1 bundle resolution, L2 nearest-neighbor, parser coverage of Pump.fun
bonding curve, sandwich-shape predicate) was correct as-shipped on
2026-05-07.

The 3 reviewer-supplied wallets (`2Grfv182…`, `GbrTNGx1…`, `J9UUgwbf…`)
returned 0 detections in their last 200 signatures because their recent
activity is all same-direction Pump.fun buys — multi-buyer pile-on
events, not sandwiches. The previous agent's harness-local detector
incorrectly flagged these as sandwiches due to looser direction matching;
production correctly skips them. Confirmed via `pnpm harness diagnose-slot`.
