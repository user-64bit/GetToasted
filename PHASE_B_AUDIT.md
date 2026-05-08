# PHASE B AUDIT — 2026-05-08

State of `apps/web/` before Phase B fixes + the changes made for the
demo flow.

## What existed already (most of the work)

- **Next.js 16 (Turbopack), App Router, Tailwind v4.** `apps/web/`.
- **Wallet adapter wired** — `app/_components/wallet-provider.tsx`,
  used by `terminal-scan-input.tsx` (`useWallet()` from
  `@solana/wallet-adapter-react`).
- **Landing page (`app/page.tsx`)** — Hero with `<TerminalScanInput>`,
  `<HowItWorks>`, `<SampleScan>`, `<CtaFooter>`. Already styled per
  the dark-forensics aesthetic — terminal-style input, threat-red
  SCAN button, mono fonts, ticker.
- **Dashboard route (`app/dashboard/page.tsx`)** — reads
  `?wallet=...` searchParam, hands off to `<DashboardClient>`.
- **`<DashboardClient>` state machine** — branches on
  `summaryQ.data?.scanStatus`:
  - `unknown` → `<NoScanYet>` (CTA to start scan)
  - `pending`/`scanning` → `<ScanningView>`
  - `failed` → `<ScanFailed>`
  - else → `<CompleteView>` (KPI row + sandwich table + losses chart)
- **`<ScanningView>`** — uses
  `@get-toasted/ui/scan-progress` for the progress UI; below it
  renders incoming sandwich cards from `useWalletSandwiches`.
- **`<CompleteView>` + `<KpiRow>` + `<SandwichTable>` + `<LossesChart>`** —
  all built and wired to `buildDashboardData`. KPIs show total
  extracted, attacks found, worst attacker, risk level. Table renders
  full attack details.
- **API integration layer** — `app/lib/api/{wallets,fetcher,types,...}.ts`
  with TanStack Query hooks (`useWalletSummary`,
  `useWalletSandwiches`, `useStartScan`). Polls
  `summary` every 2 s while scanning. Cross-domain fetch goes through
  `getApiUrl()` which defaults to `http://localhost:3001` in dev.
- **Empty-wallet handling** — `<CleanWallet>` shown by
  `<CompleteView>` when no detections.
- **Failure handling** — `<ScanFailed>` shows the worker's error
  string from `scan_jobs.error`, with rate-limit detection.
- **Refetch invalidation on scan completion** — dashboard-client
  invalidates the sandwiches query when status flips
  `scanning|pending → complete`, so the final list appears without
  the user needing to refresh.

## What was broken / blocking the demo

1. **`<NoScanYet>` and `<ScanFailed>` retry button were SIWS-gated**
   (`canScan = Boolean(me.data?.authenticated)`). The Phase A change
   removed SIWS from `POST /scan`, but the frontend still required the
   user to be signed in to *trigger* a scan. With paste-wallet flow as
   the v1 demo path, this was a hard blocker — pasting an arbitrary
   wallet would land on `<NoScanYet>` saying "Sign in with any Solana
   wallet on the home page" with no working button.

2. **No auto-trigger on dashboard visit.** Even with the gate fixed,
   the user would have to click a "Start scan" button after pasting.
   For a 3-min demo, that's an extra click in the way of the scan
   stream being the hero moment.

3. **Sandwiches list didn't refetch during the scan.**
   `useWalletSandwiches` had no `refetchInterval`, so it loaded once
   on mount (returning empty during the first second of scanning) and
   then sat idle. Detections only became visible after the parent
   dashboard-client invalidated the query on scanStatus transition —
   meaning users saw 0 sandwiches mid-scan, then a sudden full list
   at completion. The brief calls out the live-stream UX as the hero
   moment, so this was a regression vs. spec.

## What I changed

1. **`apps/web/app/dashboard/_components/dashboard-client.tsx`** —
   `<NoScanYet>` now auto-triggers `useStartScan().mutate()` on mount
   via a `useEffect` + `useRef` trip-flag. Removed the `useMe()`
   gating; the "no scan yet" state is now a transient loading view
   ("Queuing scan…") rather than a CTA. Retry button is shown only
   when the auto-fire fails.
2. **Same file, `<ScanFailed>`** — `canRetry` is now unconditionally
   `true`. Removed the SIWS gating. The retry button always appears.
3. **`apps/web/app/lib/api/wallets.ts`** — `useWalletSandwiches` now
   accepts a `UseQueryOptions` override (matching the
   `useWalletSummary` pattern) so callers can pass `refetchInterval`.
4. **`apps/web/app/dashboard/_components/scanning-view.tsx`** — passes
   `{ refetchInterval: 2000 }` to `useWalletSandwiches`. Live
   detections now stream in every 2 s while the worker is writing to
   `detected_sandwiches`.

## What I deliberately didn't change (rationale)

- **No SSE wiring on the frontend.** The `/api/v1/stream/:address`
  SSE endpoint exists on the API and works (verified in Phase A
  smoke), but the dashboard's existing 2 s polling pattern delivers
  the same UX with simpler code. Switching to SSE before the demo
  introduces a reconnection / event-source-buffering surface area
  that's not worth the polish risk. v2 cleanup.
- **`isKnownBot` / `knownBotName` not surfaced** — current rows have
  `isKnownBot: false` regardless. The KPI's "Worst attacker" falls
  back to a truncated address (`4vJfp62...`) which reads fine in the
  demo. Wiring the registry into `enrichSandwichDetection` is a
  small follow-up.
- **`lossUsd` rendering for memecoins** — current behavior shows
  `$0.00` for unpriced Pump.fun tokens (Jupiter Price API has no
  oracle for them). All 7 demo detections fall in this bucket, so
  the demo will visually show "$0 total extracted, 7 confirmed
  sandwiches at confidence 1.00". This is honest, but suboptimal
  UX. Proper fix is to surface `loss_output_amount + decimals` in
  the API response and render `≈X TOKEN (USD unknown)` per the
  detection-enricher comment. Deferred — see B.3 in the brief
  ("skip for v1").
- **Simulator page** — already exists at `/simulator`, kept as-is
  (brief says skip).
- **Landing page styling** — already matches the dark-forensics
  aesthetic per `FRONTEND_DESIGN_PROMPT.md` description. No changes.

## Verification

```bash
# Both services still run
$ curl -s http://localhost:3001/health | jq .status      # "ok"
$ curl -s -o /dev/null -w "%{http_code}" http://localhost:3000   # 200

# API returns real data for the verified wallet
$ curl -s http://localhost:3001/api/v1/wallets/8UE2QGDJ.../sandwiches?limit=5 | jq '.data | length'
# 3 (matches Phase A smoke test)

# Web dashboard SSR renders for that wallet
$ curl -s -o /tmp/d.html -w "%{http_code}\n" http://localhost:3000/dashboard?wallet=8UE2QGDJ...
# 200
```

`pnpm type-check` clean for `apps/web`.

## Demo flow (manual verification path)

1. `pnpm --filter api dev` (or `pnpm dev` at root)
2. `MAX_SCAN_DURATION_MS=600000 pnpm --filter worker-scanner dev`
3. `pnpm --filter web dev`
4. Open http://localhost:3000
5. Paste one of the Phase A.4 verified wallets:
   - `8UE2QGDJcpBp1PPjuCz3EsDtJn3wzSaPsmpVYXGRbzC7`
   - `5poWTd4YXSDmxGSMtoomWd4BMrAhpEevRpMWWiiAyqRL`
   - `9tJEZ98XuDTybkaijxnnFUomcWaLEjuAh8Q1d4HusYc3`
6. Click SCAN
7. Dashboard loads, auto-fires the scan, transitions to ScanningView
8. Sandwich cards appear during scan (2 s refresh)
9. Final view: KPI row + table

If a wallet's row already exists in `detected_sandwiches`, the demo
proceeds straight to the CompleteView (no scan triggered for completed
wallets — the sandwiches just render).
