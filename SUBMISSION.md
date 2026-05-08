# GetToasted — Hackathon Submission

**Product:** A SaaS that scans any Solana wallet for sandwich attacks
across the dominant spot DEXes (Raydium, Orca, Meteora, Pump.fun,
PumpSwap, Phoenix V1, Lifinity v2) and quantifies the USD or
underlying-token loss extracted by MEV bots. Paste a wallet, watch the
forensic scan stream attacks in live, see the totals.

**Demo video:** _attach link here once recorded._ The demo flow is the
landing page → paste wallet → scan auto-starts → sandwich cards stream
into the dashboard → KPI row + table on completion.

**Live (or local):** https://gettoasted.fun, or run locally — see the
"3-command playbook" below.

---

## Final validation result

**100% match rate (30/30) on Jito-bundle-confirmed sandwiches**, plus
**3/3 wallets pass the API → BullMQ → worker → DB → SSE end-to-end smoke
test.** Full per-wallet table in
[`research/validation-report.md`](./research/validation-report.md);
sign-off in [`PHASE_A_DONE.md`](./PHASE_A_DONE.md).

| Track | Result | Detail |
|---|---|---|
| Detector recall (offline) | **30/30 = 100%** | `pnpm harness validate-mined` against B91-mined Jito bundles |
| End-to-end smoke (production scan path) | **3/3 wallets** | API → worker → Postgres rows with detection_layer, confidence, loss_method, loss_confidence populated |
| Unit tests | **52 / 52 pass** | `@get-toasted/core` (incl. new CPMM fallthrough test) |

The 3 verified end-to-end smoke wallets — paste any of these on the
landing page in the demo:

- `8UE2QGDJcpBp1PPjuCz3EsDtJn3wzSaPsmpVYXGRbzC7` — 3 detections, all L1
- `5poWTd4YXSDmxGSMtoomWd4BMrAhpEevRpMWWiiAyqRL` — 1 detection, L2
- `9tJEZ98XuDTybkaijxnnFUomcWaLEjuAh8Q1d4HusYc3` — 2 detections, both L1

---

## Architecture

```
Browser (Next.js 16, Turbopack)
   ↓ paste wallet
Hono API (Node 20, Drizzle, Postgres-js)
   ↓ POST /api/v1/wallets/:addr/scan
BullMQ scan-historical queue (Upstash Redis)
   ↓
Scanner worker (apps/workers/scanner)
   ├── Helius enhanced gTFA + getBlock
   ├── @get-toasted/runtime block-expander (Redis 14d cache)
   ├── @get-toasted/core layered detector (L1 Jito → L2 adjacency → L3 known-bot → L4 statistical)
   ├── @get-toasted/runtime jito-bundle client (real, Redis 7d cache)
   ├── @get-toasted/runtime detection-enricher (Jupiter Price API USD denomination)
   └── Drizzle batchInsertDetections (Postgres, idempotent on victim_sig|front_sig|back_sig)
                ↓
Frontend reads via TanStack Query (2s polling)
   ├── /api/v1/wallets/:addr → status + KPIs
   ├── /api/v1/wallets/:addr/sandwiches → live detection list
   └── /api/v1/stream/:addr (SSE) — wired but not consumed by web in v1
```

Key dependencies: Next.js 16, Hono + @hono/node-server, BullMQ 5,
Drizzle ORM 0.36, postgres-js, ioredis, Helius enhanced API, Jito Bundle
Explorer REST, Jupiter Price v3.

## Layered detector

| Layer | Signal | Confidence | Status |
|---|---|---:|---|
| L1 | Jito bundle membership + sandwich-shape predicate | 1.00 | confirmed |
| L2 | Block adjacency (nearest-neighbor): same pool, same f+b signer, reversed direction, ≥ 95% sell-through | 0.95 | confirmed |
| L3 | Same-slot, known-bot signer, A→B→A pattern, ≥ 90% sell-through | 0.85 | confirmed |
| L4 | Same-slot statistical match, 5 false-positive guards | 0.65 | suspected |
| L5 | _(not enabled in v1)_ Cross-slot wide sandwich | 0.55 | suspected |

The shared predicate `isSandwichShape` is the **coin-flow primary
signal**: front and back share signer, victim's signer is different,
all three touch the same pool, and front+back reverse direction
(inventory round-trip). Jito bundle membership at L1 is independent
ground-truth evidence layered on top.

Loss model picks per pool type: CPMM reconstruction (1.00 confidence)
for x·y=k AMMs (Raydium AMM v4 / CPMM, Orca classic, Meteora classic,
PumpSwap, Pump.fun bonding) → backrun-profit-proxy (0.85) for CLMM and
when CPMM math falls through → failed-backrun-slippage (0.50) when the
back-run reverted. Includes a **CPMM sanity guard** (added 2026-05-08)
that detects inverted reserves inference and falls through to the
proxy method.

---

## Known limitations

- **Phoenix Eternal (Ellipsis Labs perpetuals)** — intentionally
  untracked in v1. Spline-based AMM with funding-rate semantics that
  the existing CPMM / proxy loss math doesn't model. v2 plan in
  [`BACKLOG.md`](./BACKLOG.md).
- **Wide non-bundled sandwiches (L4 statistical)** — detected and
  surfaced as `suspected`, distinct from `confirmed` in the UI. No
  automated ground truth; sandwiched.me has no per-wallet API.
  Validation of L4 false-positive rate is by manual spot-check.
- **Validation skew: all 30 ground-truth sandwiches share the B91
  attacker on Raydium AMM v4.** arsc-cluster bots appear dormant —
  diversification mining yielded 0 victims. Recall against B91-style
  sandwiches is 100%; recall against a future bot family with different
  shape characteristics is unmeasured.
- **Test data is ~6 months old.** B91 mineable activity falls in slot
  range 361929528–362686298 (Aug 2025). Production live coverage is
  via the realtime detector worker (`apps/workers/detector`),
  webhook-driven, exercised separately.
- **Loss USD is null for unpriced memecoins.** Jupiter Price API has no
  oracle for long-tail Pump.fun mints. The detector still emits the
  detection at the right layer + confidence and writes
  `loss_output_amount` (raw token base units) to the DB. UI currently
  renders these as `$0.00` — a v2 polish item is to surface
  "≈ X TOKEN (USD unknown)" in the dashboard.
- **L5 cross-slot sandwich** — intentionally deferred to v2 per spec
  §13.

---

## 3-command reproducibility playbook

```bash
# 0. one-time
git clone <repo> && cd GetToasted && pnpm install
cp .env.example .env  # fill in HELIUS_API_KEY, etc.
docker compose up -d  # postgres + redis
pnpm --filter @get-toasted/db migrate

# 1. mine fresh ground truth from Jito bundles
pnpm harness mine-from-known-bots \
  --bots B91piBSfCBRs5rUxCMRdJEGv7tNEnFxweWcdQJHJoFpi \
  --limit 30 --scan-limit 2000

# 2. validate every mined sandwich against the production detector
pnpm harness validate-mined research/mined-victims/known-bots-<ts>.json

# 3. run the demo
MAX_SCAN_DURATION_MS=600000 pnpm --filter worker-scanner dev   # terminal A
pnpm --filter api dev                                           # terminal B
pnpm --filter web dev                                           # terminal C
# open http://localhost:3000, paste 8UE2QGDJcpBp1PPjuCz3EsDtJn3wzSaPsmpVYXGRbzC7
```

Steps 1–2 reproduce the 30/30 result. Step 3 reproduces the demo flow.

---

## What changed in this validation pass (changelog highlights)

- **Detector — CPMM vault-inference sanity guard.**
  `reconstructCpmmLoss` now falls through to backrun-profit-proxy when
  the inferred reserves produce a counterfactual less than the actual
  output. Closes the BACKLOG.md v1.1 item. New unit test +
  `52 / 52 pass`.
- **Detector — Guard 2b (relative-loss < 0.1%) gated to L4 only.**
  Pre-fix it dropped Jito-confirmed L1 detections that extracted
  < 0.1% from a large memecoin trade. Took match rate from 9/10 to
  10/10 on the initial sample.
- **Production L1 re-enabled.** `runtime/jito-bundle.ts` was a no-op
  stub on a wrong premise; verified that
  `bundles.jito.wtf/api/v1/bundles/transaction/{sig}` +
  `bundles/bundle/{id}` work, wired the real client with Redis 7d/1h
  cache.
- **Known-bot registry — `vpe-bot` corrected.** Previous 45-char
  malformed address replaced with the canonical 43-char Helius MEV
  Report program ID, verified deployed + executable on mainnet.
- **Frontend — paste-wallet flow unblocked.** Removed SIWS gating from
  `<NoScanYet>` / `<ScanFailed>` retry; auto-trigger scan on dashboard
  visit; `useWalletSandwiches` now refetches every 2s during scan so
  detections stream in live.
- **Smoke-test orchestrator** — `scripts/smoke-test-api.ts` runs the
  full API → worker → DB → SSE flow for any wallet. Used to verify the
  3 demo wallets end-to-end.
- **Harness rewritten as a workspace package** — imports
  `@get-toasted/core` directly, so validating the harness validates
  production. New CLI: `validate-wallet`, `debug-miss`, `debug-extra`,
  `diagnose-slot`, `mine-victim-wallets`, `mine-from-known-bots`,
  `validate-mined`.

---

## Reading the artifacts

- [`AUDIT.md`](./AUDIT.md) — entry-state assessment of the codebase
  before this pass.
- [`DETECTOR.md`](./DETECTOR.md) — detector architecture, layer
  semantics, validation strategy, and operational notes.
- [`BACKLOG.md`](./BACKLOG.md) — Phoenix Eternal v2, CPMM reserves
  inference v1.1, related deferrals.
- [`PHASE_A_AUDIT.md`](./PHASE_A_AUDIT.md) /
  [`PHASE_A_DONE.md`](./PHASE_A_DONE.md) — Phase A gate sign-off
  (algorithm correctness verified end-to-end).
- [`PHASE_B_AUDIT.md`](./PHASE_B_AUDIT.md) — Phase B audit + the
  demo-blocking issues found and fixed.
- `research/algorithm-decision.md` — original algorithm spec.
- `research/validation-report.md` — full validation report.
- `research/mined-victims/` — Jito-mined ground truth, JSON.
- `research/validation-runs/` — every `validate-mined` /
  `validate-wallet` run output, JSON.
- `research/api-verifications/` — live API call artifacts proving
  Helius gTFA + Jito bundles work.
