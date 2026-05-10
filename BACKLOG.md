# Backlog

Post-v1 work captured here so it doesn't pollute current sprint scope.

## Detector

### Phoenix Eternal (perpetuals AMM) coverage — v2

Program: `EtrnLzgbS7nMMy5fbD42kXiUzGg8XQzJ972Xtk1cjWih` (Ellipsis Labs)

Identified during the 2026-05-08 validation reboot. Three of the
reviewer-supplied victim wallets had recent activity exclusively on
this program and the production detector returned zero detections
because the program is not in `TRACKED_DEX_PROGRAM_IDS`.

**Why deferred**

- Phoenix Eternal is a perpetuals AMM with spline-based pricing
  (program log line: `Phoenix Eternal 🐦‍🔥: Update Spline Parameters`).
- Sandwich semantics on perps differ from spot AMM: the loss vector
  is funding-rate manipulation and oracle-price impact, not constant-
  product slippage. Both `cpmm-reconstruction` and `backrun-profit-proxy`
  in `packages/core/src/detector-loss.ts` would produce wrong USD numbers
  on perp trades.
- A speculative add to `TRACKED_DEX_PROGRAM_IDS` would route Phoenix
  Eternal swaps through the existing same-pool/reversed-direction
  classifiers and likely flag legitimate same-block opens-then-closes
  as sandwiches.

**v2 scope when this gets picked up**

- Add `Dex` enum entry `phoenix_eternal` and matching `PoolType: "perp"`.
- Decode Phoenix Eternal's instruction layout (Anchor IDL needed; check
  Ellipsis Labs' GitHub or the on-chain IDL store).
- Build a perps-aware loss model: funding-rate-aware impact + oracle
  drift between front and back. Not a CPMM reconstruction.
- Re-validate: pick wallets with confirmed Phoenix Eternal sandwich
  activity (require Jito-bundle ground truth) and target > 90% recall
  there separately from spot-DEX recall.

Trigger: user demand for perp coverage, or a credibly large share of
sandwich volume migrating to spline AMMs.

### Deterministic CPMM vault-account derivation — v1.1

The defensive fix has shipped (`reconstructCpmmLoss` now sanity-guards
`counterfactual < actual` and falls through to `backrun-profit-proxy`,
preventing the clamped-to-zero loss bug). What remains is the underlying
heuristic in `packages/runtime/src/block-expander.ts`
`inferPoolReservesFromTx`: it picks the "largest non-signer balance per
mint" as the pool vault, which is wrong when a non-pool token account
of the same mint is also present in the tx. The CPMM math then never
runs (the sanity guard kicks in and routes to the proxy), so loss is
correct but with `lossConfidence: 0.85` instead of `1.00`.

**v1.1 work:** identify pool vault accounts deterministically via each
DEX's program-specific account layout. Raydium AMM v4 vaults are
derivable from the AMM account; Orca / Meteora have similar program-
defined relationships. This restores `cpmm-reconstruction` (confidence
1.00) on the affected swaps. Trigger when the proxy/CPMM ratio in
production rows justifies the work.
