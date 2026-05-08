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

### CPMM reserves-inference accuracy — v1.1

When the smoke test ran the production scanner against wallet
`8UE2QGDJcpBp1PPjuCz3EsDtJn3wzSaPsmpVYXGRbzC7` at slot 362686298, the
detection was correctly emitted at L1 confidence 1.00 with
`loss_method=cpmm-reconstruction`, but `loss_output_amount=0` and
`loss_usd=null`. Inspection of the persisted row shows
`counterfactual_out_amt=7833217972882` while `victim_out_amt=25962124601544`
— counterfactual < actual, which is impossible for a buy-side sandwich
under x·y=k (front-run pushes token price up, so victim should get
*less* than the counterfactual).

Root cause: `inferPoolReservesFromTx` in `packages/runtime/src/block-expander.ts`
picks the wrong vault account for one or both sides of the pair on this
Raydium AMM v4 swap. The "largest non-signer balance per mint" heuristic
appears to be confused by a non-pool token account also present in the
tx. The CPMM math then runs against bogus reserves and produces an
inverted counterfactual; the dispatcher clamps the negative loss to 0.

**Why this didn't break detection:** the sandwich is still classified
correctly at L1 (Jito-bundle membership is the layer signal, not
reserves). The loss column is just wrong.

**v1.1 plan:**
- Add a sanity check in `reconstructCpmmLoss`: if `counterfactual < actual`,
  treat as a reserves-inference failure (return `lossConfidence: 0`) so
  the dispatcher falls through to `backrun-profit-proxy` which uses the
  bot's realized profit instead.
- Longer term: identify pool vault accounts deterministically via the
  DEX's program-specific account layout (Raydium AMM v4: vault
  addresses are derivable from the AMM account), not by balance heuristic.
