# AUDIT — 2026-05-07

Produced by the orienting pass before any code changes per the rebooted detector brief (Part 1.1).

## Summary

- Total non-vendor TS/MD/JSON files in repo: 206
- Detector production code: 19 files under `packages/core/src/` (detector + losses + filters + L1–L4 + tests)
- Runtime support code: 13 files under `packages/runtime/src/` (block expander, Jito client, leader schedule, enricher, caches)
- Harness code: 9 files under `tools/detector-harness/src/` (CLI, harness-local detector, block parser, RPC client, Jito client, price enricher)
- Test/fixture code: `tests/detector/fixtures/{positive,negative,edge-cases}` populated by harness CLI; unit tests live next to source in `packages/core/src/*.test.ts` and `packages/runtime/src/*.test.ts`
- Research notes: 7 primary-source notes + `algorithm-decision.md` + `validation-report.md` + 2 API verification artifacts

## Algorithm Decision Status

- Document exists: **yes** (`research/algorithm-decision.md`, dated 2026-05-06)
- Last updated: 2026-05-06
- Primary signal: **coin-flow + victim-in-the-middle**, with bundle and adjacency as confidence boosters (matches what the rebooted brief asked for)
- Loss method: **hybrid** (CPMM reconstruction → back-run proxy → failed back-run slippage)

The decision document is internally coherent, matches Helius / a-guard / sandwiched.me primary sources, and lines up with the brief's §3.1 algorithm spec. It is **not** based on training-data memory.

## Verification Status

| Check | Status | Evidence |
|---|---|---|
| Helius `getTransactionsForAddress` | **paid plan only — confirmed** | `research/api-verifications/gtfa-response.json` returned `-32403 paid plans only` on 2026-05-06; reproduced today. Production correctly never depends on it. |
| Helius `getSignaturesForAddress` + `getBlock` path | **assumed working** (in active use by harness + scanner) | not re-verified live in this audit; production scanner uses it daily |
| Jito `bundles/transaction/{sig}` endpoint | **WORKING — but production says it doesn't exist** | `research/api-verifications/jito-bundle-response.json` returned the Komeko bundle on 2026-05-06. **DETECTOR.md and `apps/...jito-stub` claim no such endpoint exists; that is wrong. The harness uses it successfully.** |
| Jito `getRecentBundles` / `arbitrages/recent` | **assumed working** (harness uses both) | not re-verified |
| Sandwiched.me public per-wallet API | **NOT AVAILABLE** | Routes tested today: `/wallet/{addr}` 404, `/wallets/{addr}` 404, `/victims/{addr}` 404, `/address/{addr}` 404, `/sandwichers/{addr}` 404, `/account/{addr}` 404. `/sandwiches/{addr}` returns 200 but is the *per-attack-UUID* route (renders "Sandwich Not Found" for a wallet pubkey). `nextgen.mev-hub.snowgenesis.com` is Cloudflare-protected (HTTP 403). `api.sandwiched.me` returns 522 (origin not configured). **There is no per-victim-wallet listing route on sandwiched.me that we can scrape or call directly.** |
| Live wallet end-to-end scan | **partially exercised** | The previous agent ran the harness against all 3 user wallets on 2026-05-07; it returned 1 detection per wallet — but all three are the *same slot* (418124934) and same attacker (`7TEpbqBGMNzv3xkWXU3zQMkiFC79w4cXABszYKBFTXTv`). Statistically inadequate to call anything validated. |

## File-by-file

### `packages/core/src/` (production detector)

- `detector.ts` — `detectSandwichForVictim` orchestrator. Runs L1 → L2 → L3 → L4, short-circuits on first match, applies loss + post-filters. Coherent, matches spec. **STATUS: looks correct.**
- `detector-l1.ts` — Jito-bundle layer + `isSandwichShape` predicate. **STATUS: stub returns null because someone wrote that no public Jito reverse-lookup exists. That's wrong (verified above).**
- `detector-l2.ts` — Block-adjacency layer using nearest-neighbor (relaxed from strict ±1 per the documented bug-fix in DETECTOR.md). **STATUS: looks correct, justified relaxation.**
- `detector-l3.ts` — Known-bot same-slot. Uses `KNOWN_SANDWICH_BOTS` registry. **STATUS: depends on registry quality (see below).**
- `detector-l4.ts` — Statistical wide-sandwich with 6 false-positive guards. **STATUS: looks correct, conservative thresholds.**
- `detector-loss.ts` — `computeLoss` dispatcher → CPMM reconstruction / back-run proxy / failed back-run.
- `detector-filters.ts` — `passesPostFilters` (self-sandwich, negligible-loss).
- `known-bots.ts` — 5 bot entries. **STATUS: at least one entry (`vpeNALD85GyYAcK4ms5kKqfJrJxVQuCwf24gWjNoax38b`, `vpe-bot`) is flagged in the validation report as causing `getSignaturesForAddress` to reject the address as invalid size. Needs verification on-chain.**
- `dex-fees.ts`, `dex-programs.ts`, `pricing.ts`, `constants.ts`, `types.ts`, `detector-types.ts`, `index.ts`, `jito.ts` — supporting code.
- `detector.test.ts`, `detector-loss.test.ts`, `detector-filters.test.ts` — synthetic-shape unit tests.

### `packages/runtime/src/`

- `block-expander.ts` — `getBlock` + parse + reserves extraction; ±25 anchor window around victim tx.
- `jito-bundle.ts` — `JitoBundleClient` with Redis cache. Implementation of `JitoBundleResolver`. **STATUS: needs to be re-enabled and pointed at the working `bundles.jito.wtf/api/v1/bundles/transaction/{sig}` endpoint that L1 currently bypasses.**
- `detection-enricher.ts` — `SandwichDetection` → DB `SandwichInsert` row.
- Caches and helpers; tests next to source.

### `tools/detector-harness/src/`

- `cli.ts` — 11-subcommand CLI: `analyze`, `analyze-block`, `analyze-window`, `analyze-wallet`, `discover-signer-positives`, `discover-recent-bundle-positives`, `bootstrap-a-guard`, `bootstrap-a-guard-edges`, `bootstrap-arbitrage-negatives`, `refresh-fixtures`, `validate-fixtures`. **No `validate-wallet`, `debug-miss`, or `debug-extra` commands as the brief specifies.**
- `detector.ts` — **HARNESS-LOCAL re-implementation of the detector.** Has its own `detectBundleSandwiches`, `detectAdjacencySandwiches`, `detectCoinFlowSandwiches`, `detectStatisticalWindowSandwiches`. **Does NOT call `@get-toasted/core`. This is the most important defect: validating the harness does not validate production.** Different shapes (`TxSummary` / `TokenDelta` here vs. `ParsedSwap` in core), different layer logic, different confidence formulae.
- `block-parser.ts` — Harness-local block parser producing `TxSummary`. Parallel to `packages/runtime/block-expander.ts`.
- `jito.ts` — Harness Jito client; uses the working `bundles/transaction/{sig}` endpoint.
- `rpc.ts`, `price.ts`, `env.ts`, `constants.ts`, `types.ts` — supporting code.

### `tests/detector/fixtures/`

- `positive/` — 1 organic-wallet fixture per user wallet (sandwiched-wallet-2Grfv182…, sandwiched-wallet-GbrTNGx1…, sandwiched-wallet-J9UUgwbf…), all from slot 418124934 (same Pump.fun event). Plus Komeko + B91 mined fixtures from Jito.
- `negative/` — Jito-arbitrage-derived negatives (10 per validation report). No failed-back-run / self-sandwich / Jupiter-multi-hop / JIT-liquidity classes.
- `edge-cases/` — 5 victims from one Sandwiched.me wide-sandwich event (all from the same UUID; not 5 distinct events).

### `research/`

- `algorithm-decision.md` — coherent, sourced.
- `validation-report.md` — **explicitly says Phase 2 is "not ready for Phase 3"** under the previous agent's own criteria.
- `notes/` — 7 source-by-source notes. Light but adequate.
- `api-verifications/gtfa-response.json` — confirms gTFA paywalled.
- `api-verifications/jito-bundle-response.json` — confirms `bundles/transaction/{sig}` works for the Komeko canonical bundle.

## Red Flags

1. **Two parallel detector implementations.** `packages/core/src/detector*.ts` (production) and `tools/detector-harness/src/detector.ts` (harness-local). They diverge in algorithm, shape, and confidence logic. The brief's whole premise — "validate match rate against sandwiched.me" — only works if the *production* detector is what gets validated. Today it is not.
2. **L1 disabled on a false premise.** DETECTOR.md asserts no public Jito reverse-lookup endpoint exists; my verification today (re-running the previous agent's saved artifact and re-checking the response shape) shows `bundles.jito.wtf/api/v1/bundles/transaction/{sig}` returns the bundle. The harness uses this same endpoint. L1 should be wired up; that's the highest-confidence layer.
3. **No real ground-truth source for validation.** Sandwiched.me has no per-victim-wallet route I can find; their API host is Cloudflare-protected. The previous agent stalled here. Realistic options for v1: (a) use Jito bundles as independent ground truth for *tight* sandwiches — mechanical and reliable; (b) ask the user to paste sandwiched.me-listed attacks for *wide* sandwiches.
4. **`vpe-bot` registry address suspect.** Per the validation report, it failed `getSignaturesForAddress` due to invalid size. If the address is wrong in the registry, L3 silently never fires for the most-cited (~50% of all attacks per the Helius report) bot family.
5. **No CPMM reconstruction validated end-to-end.** Komeko is Raydium AMM v4 (CPMM) and *should* reconstruct, but every fixture in the validation report uses `backrun-proxy`. The CPMM dispatcher path may have a real bug (mint mismatch fall-through is documented in the git log).
6. **Negative fixtures only cover one class** (Jito arbitrage). Failed back-run, self-sandwich, Jupiter multi-hop, and JIT liquidity have zero negatives. False-positive surface is unmeasured.
7. **All 3 organic detections collapse to one slot/attacker/event.** That gives effectively n=1 wallet evidence, not n=3. Validation against this is meaningless statistically.

## Honest Assessment — State B

The existing code is **salvageable, not throw-away**. The algorithm decision, the L2/L3/L4 logic, the layered orchestrator, the layered loss math, and the harness scaffolding are all coherent and primary-source-grounded. The brain is right.

What is broken is execution and validation:
- Validation never connected to production (harness has a parallel detector).
- L1 is disabled on a wrong premise.
- The registry has a suspect entry.
- The user's three wallets gave one effective data point, not three.
- No mechanical fallback ground-truth source was wired up when sandwiched.me proved unreachable.

These are all discrete, fixable defects. **Wiping `packages/core/src/detector*.ts` would discard real, working code.** Plan: **proceed in State B** — fix the harness to call the production detector, re-enable L1 against the verified Jito endpoint, fix the registry, add Jito-based mechanical ground truth, ask the user for whatever sandwiched.me cross-checks they can paste, then iterate per Part 2 against the 3 wallets until > 90% match rate, then request more wallets per the brief's §2.4 prompt.

If after 3 iterations on the same wallet match rate is still under 90%, stop and follow the §2.4 escalation script — don't paper over it.

## Decision

**State B.** Refactor in place; do not wipe.

Next steps, in order:

1. Make the harness call `packages/core` (kill the harness-local detector, or have it import from core).
2. Re-enable L1 in production: wire `runtime/jito-bundle.ts` to the working `bundles.jito.wtf/api/v1/bundles/transaction/{sig}` endpoint and remove the no-op stub from L1.
3. Verify `vpe-bot` registry address on chain; remove or fix.
4. Add `validate-wallet`, `debug-miss`, `debug-extra` commands to the harness per §2.1.
5. Wire mechanical Jito-based ground truth into `validate-wallet` — for each wallet signature, look up Jito bundle membership; bundles of size ≥3 with sandwich shape are independent positive ground truth.
6. Ask the user to paste sandwiched.me listings only for the slots/wallets where Jito bundle evidence is silent (i.e. wide non-bundled sandwiches), per the §2.2 fallback prompt.
7. Run validation, iterate until > 90% on each of the 3 user wallets, then request 3 more.
