"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
// useMe is no longer needed: SIWS gating was removed for the v1 demo
// scan flow. Re-import when SIWS is re-enabled in v2.
import {
  useStartScan,
  useWalletSandwiches,
  useWalletSummary,
} from "../../lib/api/wallets";
import { ApiError } from "../../lib/api/fetcher";
import { CompleteView } from "./complete-view";
import { DashboardTopbar } from "./dashboard-topbar";
import { ScanningView } from "./scanning-view";
import { buildDashboardData } from "./view-model";

interface DashboardClientProps {
  wallet: string;
}

export function DashboardClient({ wallet }: DashboardClientProps) {
  const qc = useQueryClient();

  const summaryQ = useWalletSummary(wallet, {
    refetchInterval: (q) => {
      const status = q.state.data?.scanStatus;
      return status === "scanning" || status === "pending" ? 2000 : false;
    },
  });

  const sandwichesQ = useWalletSandwiches(wallet, { limit: 100 });

  // The sandwiches query has no live signal of its own — it loads once
  // on mount and then sits idle. During a scan the worker is still
  // writing detections, so the first fetch usually returns an empty
  // array. When the wallet's scan flips to "complete" the worker has
  // just finished its final batchInsertDetections; we invalidate the
  // sandwiches query (prefix-match — works for any `q` variant) so the
  // dashboard refetches and surfaces the newly-persisted rows. Without
  // this invalidation the UI gets stuck at "Loading attacks…" with
  // stale empty data even though detections are in the database.
  //
  // We track the previous status with a ref so the invalidate fires on
  // the *transition* (scanning|pending → complete), not every rerender
  // while status is "complete".
  const status = summaryQ.data?.scanStatus;
  const prevStatusRef = useRef<typeof status>(undefined);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (status !== "complete") return;
    if (prev === "complete") return; // already invalidated on the transition
    if (!wallet) return;
    qc.invalidateQueries({ queryKey: ["wallet", wallet, "sandwiches"] });
  }, [status, wallet, qc]);

  const data = useMemo(() => {
    if (!summaryQ.data || !sandwichesQ.data) return null;
    return buildDashboardData(summaryQ.data, sandwichesQ.data.data);
  }, [summaryQ.data, sandwichesQ.data]);

  if (summaryQ.isLoading) {
    return <CenterMessage label="Loading wallet" />;
  }

  if (summaryQ.isError) {
    return (
      <ScanFailed wallet={wallet} reason={errorMessage(summaryQ.error)} />
    );
  }

  const displayStatus = summaryQ.data?.scanStatus ?? "unknown";

  if (displayStatus === "unknown") {
    return <NoScanYet wallet={wallet} />;
  }

  if (displayStatus === "scanning" || displayStatus === "pending") {
    return <ScanningView wallet={wallet} summary={summaryQ.data!} />;
  }

  if (displayStatus === "failed") {
    return (
      <ScanFailed
        wallet={wallet}
        reason={summaryQ.data?.scanError ?? "Unknown scan failure"}
      />
    );
  }

  // Surface sandwiches-query errors instead of letting them fall through
  // to the perpetual "Loading attacks…" placeholder.
  if (sandwichesQ.isError) {
    return (
      <ScanFailed wallet={wallet} reason={errorMessage(sandwichesQ.error)} />
    );
  }

  if (!data) {
    return <CenterMessage wallet={wallet} label="Loading attacks" />;
  }

  return <CompleteView wallet={wallet} data={data} />;
}

function ScanFailed({ wallet, reason }: { wallet: string; reason: string }) {
  const startScan = useStartScan(wallet);
  const truncated =
    wallet.length > 10 ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}` : wallet;

  // Surface upstream rate-limiting in plainer language so the user knows
  // it's not a bug in their wallet — the API hit a quota.
  const isRateLimit = /rate limit|max usage|429/i.test(reason);
  const headline = isRateLimit
    ? "Scan blocked: API quota exhausted."
    : "Scan failed.";
  const detail = isRateLimit
    ? "The on-chain data provider (Helius) is at its monthly quota. Retry once it resets, or upgrade the API plan."
    : reason;

  return (
    <>
      <DashboardTopbar wallet={wallet} />
      <main className="px-5 py-12 md:px-10 md:py-16">
        <section
          className="mx-auto"
          style={{
            maxWidth: 560,
            background: "var(--bg-surface)",
            border: "1px solid var(--threat-red-border)",
            borderRadius: "var(--radius-panel)",
            overflow: "hidden",
          }}
        >
          <header
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid var(--threat-red-border)",
              background: "var(--threat-red-dim)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span
              aria-hidden
              className="inline-block rounded-full"
              style={{
                width: 8,
                height: 8,
                background: "var(--threat-red)",
                animation: "threat-pulse 2s infinite",
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--threat-red)",
                textTransform: "uppercase",
                letterSpacing: 0,
              }}
            >
              Scan error · {truncated}
            </span>
          </header>

          <div style={{ padding: 24 }}>
            <h1
              className="text-h1"
              style={{ color: "var(--text-primary)" }}
            >
              {headline}
            </h1>
            <p
              className="text-body-sm"
              style={{ marginTop: 14 }}
            >
              {detail}
            </p>
            {!isRateLimit && (
              <pre
                className="mt-4"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--text-tertiary)",
                  background: "var(--bg-field)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 4,
                  padding: 10,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  margin: 0,
                }}
              >
                {reason}
              </pre>
            )}

            <div className="mt-6 flex items-center gap-2">
              <button
                type="button"
                onClick={() => startScan.mutate()}
                disabled={startScan.isPending}
                className="gt-btn"
                style={{
                  background: "var(--accent)",
                  color: "var(--text-inverse)",
                  padding: "10px 16px",
                  borderRadius: 6,
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  fontWeight: 500,
                  letterSpacing: 0,
                }}
              >
                {startScan.isPending ? "Queuing…" : "Retry scan →"}
              </button>
              <Link
                href="/"
                className="gt-btn-secondary"
                style={{
                  border: "1px solid var(--border-default)",
                  borderRadius: 6,
                  padding: "10px 14px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  letterSpacing: 0,
                }}
              >
                Different wallet
              </Link>
            </div>

            {startScan.isError && (
              <p
                className="mt-4"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: "var(--threat-red)",
                }}
              >
                {errorMessage(startScan.error)}
              </p>
            )}
          </div>
        </section>
      </main>
    </>
  );
}

function NoScanYet({ wallet }: { wallet: string }) {
  // v1 demo: POST /scan is unauthenticated (SIWS gate removed for the
  // paste-wallet flow). Auto-trigger the scan on mount so the user who
  // just submitted on the landing page sees the scanning view
  // immediately rather than having to click a second button.
  const startScan = useStartScan(wallet);
  const triggered = useRef(false);

  useEffect(() => {
    if (triggered.current) return;
    if (startScan.isPending || startScan.isSuccess) return;
    triggered.current = true;
    startScan.mutate();
  }, [startScan]);

  // SCAN_LOCK_HELD (409) means a worker is already processing this
  // wallet — that's "in progress", not a failure. Fall through to the
  // queued view; the summary query will flip to scanning/complete on
  // its next 2s poll.
  if (startScan.isError && !isScanLockHeld(startScan.error)) {
    return (
      <ScanFailed wallet={wallet} reason={errorMessage(startScan.error)} />
    );
  }

  return (
    <>
      <DashboardTopbar wallet={wallet} />
      <main className="px-5 py-12 md:px-10 md:py-16">
        <div className="mx-auto" style={{ maxWidth: 720 }}>
          <p
            className="text-kicker"
            style={{ marginBottom: 16, color: "var(--accent)" }}
          >
            § DASHBOARD / QUEUED
          </p>
          <h1
            className="text-h1"
            style={{ color: "var(--text-primary)", marginBottom: 12 }}
          >
            Booting <em>forensic scan…</em>
          </h1>
          <p
            className="text-body-sm"
            style={{ maxWidth: 560 }}
          >
            Allocating a worker on the queue. The first batch lands in a few
            seconds.
          </p>
          <div className="mt-8">
            <StageRailTeaser />
          </div>
        </div>
      </main>
    </>
  );
}

const STAGE_LABELS = ["Queue", "Fetch", "Decode", "Detect", "Score"] as const;

function StageRailTeaser() {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-panel)",
        padding: 18,
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="gt-scan-pulse-dot brand" aria-hidden />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--accent)",
            textTransform: "uppercase",
            letterSpacing: "0.15em",
            fontWeight: 600,
          }}
        >
          Waiting for worker
        </span>
      </div>
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${STAGE_LABELS.length}, 1fr)`,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
        }}
      >
        {STAGE_LABELS.map((label, i) => (
          <div
            key={label}
            style={{
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-chip)",
              padding: "8px 10px",
              background:
                i === 0 ? "var(--bg-overlay)" : "var(--bg-field)",
              color:
                i === 0 ? "var(--accent)" : "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
            className={i === 0 ? "gt-stage-active" : undefined}
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

function CenterMessage({ wallet, label }: { wallet?: string; label: string }) {
  return (
    <>
      {wallet ? <DashboardTopbar wallet={wallet} /> : null}
      <main
        className="px-5 py-16"
        style={{
          minHeight: wallet ? "calc(100vh - 56px)" : "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 16px",
            border: "1px solid var(--border-subtle)",
            borderRadius: 999,
            background: "var(--bg-surface)",
          }}
        >
          <span className="gt-scan-pulse-dot" aria-hidden />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--text-secondary)",
              letterSpacing: 0,
            }}
          >
            {label}
          </span>
        </div>
      </main>
    </>
  );
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

function isScanLockHeld(err: unknown): boolean {
  return err instanceof ApiError && err.code === "SCAN_LOCK_HELD";
}
