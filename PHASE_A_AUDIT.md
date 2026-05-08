# PHASE A AUDIT — 2026-05-08

State assessment before Phase A fixes. Walks the A.2 checklist + maps
the current call chain.

## Call chain (production)

```
POST /api/v1/wallets/:address/scan   apps/api/src/routes/v1/wallets.ts:147
        ↓
ScanJobsQ.createScanJob              packages/db/src/queries/scanJobs.ts:7
        ↓
scanQueue.add("scan", ...)           BullMQ "scan-historical"
        ↓
worker-scanner processJob            apps/workers/scanner/src/index.ts:224
        ↓
helius.getTransactionsForAddress     v0 enhanced REST (paid plan)
        ↓
discoverScanCandidates               local helper, filter by tracked DEX
        ↓
blockExpander.getSwapsForSlots       packages/runtime/src/block-expander.ts
        ↓
detectSandwichesForWalletSwaps       @get-toasted/core/detector.ts:118
        ├── detectSandwichForVictim  packages/core/src/detector.ts:59
        │     ├── detectL1JitoBundle (detector-l1.ts) → L1
        │     ├── detectL2Adjacency  (detector-l2.ts) → L2
        │     ├── detectL3KnownBot   (detector-l3.ts) → L3
        │     └── detectL4Statistical (detector-l4.ts) → L4
        ├── computeLoss              (detector-loss.ts)
        └── passesPostFilters        (detector-filters.ts)
        ↓
enrichSandwichDetection              packages/runtime/src/detection-enricher.ts
        ↓
Sandwiches.batchInsertDetections     packages/db/src/queries/sandwiches.ts:25
        ↓ (idempotent on victim_sig|front_sig|back_sig)
detected_sandwiches Postgres
```

**Critical confirmation:** the harness's `validate-mined` 30/30 result
came from the *exact* same code path. Both the harness's
`validateBundle` and the production scanner call
`detectSandwichesForWalletSwaps` from `@get-toasted/core` directly. No
drift. ✓

## A.2 Checklist

### Detection correctness

- ✅ **L1 (Jito bundle)** — `packages/core/src/detector-l1.ts`. Wired at
  `detector.ts:74`. Production Jito client at
  `runtime/jito-bundle.ts` hits both `bundles/transaction/{sig}` and
  `bundles/bundle/{id}` with Redis 7d/1h cache.
- ✅ **L2 (block adjacency, nearest-neighbor)** —
  `packages/core/src/detector-l2.ts`. Wired at `detector.ts:79`. Sells
  ≥ 95% tolerance + `isSandwichShape`.
- ✅ **L3 (known-bot)** — `packages/core/src/detector-l3.ts`. Wired at
  `detector.ts:85`. Registry has 5 entries: arsc-cold, arsc-active,
  arsc-warm, B91 (program), vpe-bot (program, fixed last session to
  `vpeNALD89BZ4KxNUFjdLmFXBCwtyqBDQ85ouNoax38b`).
- ✅ **L4 (statistical wide)** — `packages/core/src/detector-l4.ts`.
  Wired at `detector.ts:90`. Confidence 0.65, status `suspected`.
- ✅ **L5 (cross-slot)** — intentionally not wired per spec §13;
  `detector.ts:42-46` documents the deferral. BACKLOG covers this
  implicitly under the Phoenix Eternal entry; explicitly captured
  here as a known scope decision.
- ✅ **Coin-flow primary signal** — `isSandwichShape` predicate in
  `detector-l1.ts:82` is the coin-flow check (input/output mint
  reversal = inventory round-trip). Reused by L2/L3/L4.
- ✅ **Self-sandwich filter (Guard 1)** — `detector-filters.ts:25`.
  Active across all layers.
- ❓ **Negligible-loss filter (Guard 3)** — the brief calls this
  "Guard 3" but the code only has Guard 1 (self-sandwich), Guard 2a
  (USD < $0.01), Guard 2b (relative loss < 0.1% — L4 only). I treat
  Guard 2a as "Guard 3" since they share intent (negligible loss). ✅
- ✅ **L4-only Guard 2b gating** — `detector-filters.ts:48-67`. Still
  in place (verified by reading + tests at line 96 of
  `detector-filters.test.ts` which asserts L1/L2/L3 admit when L4
  would reject).

### Loss calculation

- ✅ **CPMM reconstruction** for Raydium v4 / CPMM / Orca classic /
  Meteora classic / PumpSwap / Pump.fun bonding — `detector-loss.ts:70`.
  Picked via `isCpmmDex(victim.dex)` at `detector-loss.ts:33`.
- ✅ **Backrun proxy fallback** — `detector-loss.ts:144`.
- ✅ **Failed back-run slippage** — `detector-loss.ts:191`.
- ❌ **Vault-inference fix from BACKLOG.md** — **NOT YET APPLIED**.
  Highest-priority Phase A action. The smoke test row at slot
  362686298 has `counterfactual_out_amt=7833217972882` <
  `victim_out_amt=25962124601544` → loss clamped to 0 → `loss_usd`
  null. Fix is documented in BACKLOG: when counterfactual < actual,
  fall through to backrun-proxy. Will apply now.
- ✅ **USD denomination** via `enrichSandwichDetection` →
  `prices.getTokenPriceUsd(victim.outputMint, blockTime)`. Returns
  null for unpriced memecoins; the row stores `loss_usd: null` +
  `loss_output_amount` populated. Frontend renders "≈X TOKEN (USD
  unknown)".
- 🟡 **`LossCalculation` shape** — current type has
  `{method, actualOutput, counterfactualOutput, lossInOutputToken,
  lossUsd, lossConfidence}`. Brief asks for nullable output fields,
  optional `lossInProxyToken` JSON, `notes` string. Current shape
  is simpler but functionally complete for the demo. Adding `notes`
  is small and useful — will add to support the vault-inference fix's
  diagnostic message.

### Persistence

- ✅ **detection_layer / loss_method / loss_confidence /
  loss_output_amount** columns present (verified via psql).
- 🟡 **bundle_id / coin_flow_signature columns** — not present.
  bundle_id is recoverable from `front_sig` + Jito API; not blocking
  the demo. Won't add.
- 🟡 **notes column** — not present. Adding requires migration. The
  vault-inference fix can be implemented without the notes column —
  the fallback method (`backrun-profit-proxy`) is already
  self-documenting via the `loss_method` column. Skipping the notes
  column for v1.
- 🟡 **block_cache table** — not present. Block expansion uses Redis
  (`slot:swaps:{slot}` key, 14-day TTL) instead of Postgres. Different
  implementation than the brief's spec but functionally equivalent and
  already validated; not blocking.
- ✅ **Idempotent insert** — `onConflictDoNothing` on
  `(victim_sig, front_sig, back_sig)` at `sandwiches.ts:41`.
- ✅ **Migration applied** — `0003_layered_detector.sql`. Verified via
  psql column listing (29 columns including the new ones).

### Worker pipeline

- ✅ **`scan-historical` queue accepts `{ wallet, jobId }`**. Cursor
  resume supported via `resumeCursor` field (not currently used).
- ✅ **Worker calls `detectSandwichesForWalletSwaps` from
  `@get-toasted/core` directly** — `scanner/src/index.ts:9`.
  No fork. No copy.
- ✅ **Progress emission** — Redis key `scan:progress:{wallet}`
  (`scanner/src/index.ts:375`) + BullMQ `job.updateProgress`. Verified
  in last session's smoke test (6 unique snapshots).
- ✅ **Empty-result handling** — when no detections, scan completes
  with `status="done"`, `sandwichesFound=0`. Wallet status =
  `complete`. Verified in prior runs against the 3 reviewer wallets.
- ✅ **Failure handling** — try/catch at `scanner/src/index.ts:415-424`
  → `failScanJob(error)` + `setWalletScanStatus("failed")`. Covered.
- ✅ **MAX_SCAN_DURATION_MS env-overridable** — confirmed in
  `.env.example` (block at lines 32-37) + `serverEnv` at
  `packages/env/src/index.ts:60`.

### API surface

- 🟡 **POST /api/v1/wallets/:address/scan** — exists at
  `wallets.ts:147` but **gated by `authMiddleware`** (SIWS).
  For the demo flow ("paste wallet → scan starts" without SIWS per the
  brief's Phase B exclusions), this needs to be unauthenticated, OR
  the frontend needs to bypass auth somehow. Will remove the auth
  gate for the demo per the brief: "SIWS authentication (paste-wallet
  works fine for demo)".
- ✅ **GET /api/v1/stream/:address** — SSE at `stream.ts:16`. Polls
  `scan_jobs` every 2s for progress + tails Redis stream
  `alerts:queue:{wallet}` for live detections + heartbeat every 15s.
  *Note:* the brief asked for `/api/v1/wallets/:address/scan/:jobId/stream`;
  current implementation is `/api/v1/stream/:address` (single endpoint
  per wallet, not per-jobId). The wallet-keyed version is simpler for
  the demo and the same Redis keys back both. Keeping.
- ✅ **GET /api/v1/wallets/:address** — wallets.ts:42. Returns
  `scanStatus`, `sandwichCount`, `totalLossUsd`, etc.
- ✅ **GET /api/v1/wallets/:address/sandwiches** — wallets.ts:117.
  Paginated.

### Observability

- 🟡 **`sandwich.detected` log event** — current code logs at
  `scanner.ts:339-352` (`scanner: batch detection complete`) but not a
  per-detection structured event. Persisted detections are observable
  via DB. Adding a per-detection log line is small.
- 🟡 **`sandwich.rejected` log event** — not currently emitted at
  classifier-rejection time. There's a "wallet swap in slot but no
  L1/L2 detection" diagnostic at `scanner.ts:215`, capped at 5/scan.
  Not a per-rejection log but functionally similar. Skipping deeper
  observability for the demo.
- ✅ **Scan completion log** — `scanner.ts:405-414` includes
  `signaturesProcessed`, `sandwichesFound`, `slotsExpandedTotal`,
  `stopReason`, `durationMs`. Helius credits aren't tracked
  separately; could be derived but not in scope for demo.

## Test status (baseline)

```
@get-toasted/core      — 51 tests pass (3 files)
@get-toasted/runtime   — 13 tests pass (3 files)
```

## Phase A action items (in order)

1. **Apply CPMM vault-inference fix** in `detector-loss.ts` —
   `counterfactual < actual` falls through to backrun-proxy.
2. **Add a unit test** for the inverted-reserves scenario.
3. **Remove `authMiddleware` from POST /scan** so the demo flow works
   without SIWS.
4. **Re-run `validate-mined` against the 30-wallet ground truth** to
   confirm 100% holds after the loss fix.
5. **Run end-to-end smoke test on 3 wallets via the API** — check
   counts match, SSE flows, persisted rows have non-zero loss_usd OR
   documented null.
6. **Sign off in `PHASE_A_DONE.md`**.

Items NOT being done (with rationale):
- `bundle_id` / `coin_flow_signature` / `notes` columns: not blocking
  demo; adding requires migration + frontend coordination.
- `block_cache` Postgres table: Redis cache is functionally equivalent,
  validated, and already in production code path.
- Per-detection `sandwich.detected` / `sandwich.rejected` log events:
  scan-completion log is sufficient for the demo's observability.
- L5 cross-slot: explicitly deferred to v2 per spec §13.
- Phoenix Eternal: in BACKLOG.md as v2 work.
