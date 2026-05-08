"use client";

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
    return <CenterMessage label="Loading wallet…" />;
  }

  if (summaryQ.isError) {
    return (
      <CenterMessage
        label="Failed to load wallet"
        detail={errorMessage(summaryQ.error)}
      />
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
      <CenterMessage
        label="Failed to load attacks"
        detail={errorMessage(sandwichesQ.error)}
      />
    );
  }

  if (!data) {
    return <CenterMessage label="Loading attacks…" />;
  }

  return <CompleteView wallet={wallet} data={data} />;
}

function ScanFailed({ wallet, reason }: { wallet: string; reason: string }) {
  const startScan = useStartScan(wallet);
  // v1 demo: scan is anonymous, so retry is always available.
  const canRetry = true;
  void wallet; // wallet kept on signature for future use

  // Surface upstream rate-limiting in plainer language so the user knows
  // it's not a bug in their wallet — the API hit a quota.
  const isRateLimit = /rate limit|max usage|429/i.test(reason);
  const headline = isRateLimit ? "Scan blocked: API quota exhausted." : "Scan failed.";
  const detail = isRateLimit
    ? "The on-chain data provider (Helius) is at its monthly quota. Retry once it resets, or upgrade the API plan."
    : reason;

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <p className="text-label" style={{ color: "var(--threat-red)" }}>
          Scan error
        </p>
        <h1 className="text-h1 mt-3">{headline}</h1>
        <p
          className="mt-3"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 15,
            lineHeight: 1.6,
            color: "var(--text-secondary)",
          }}
        >
          {detail}
        </p>
        <p
          className="mt-4"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-secondary)",
            opacity: 0.6,
            wordBreak: "break-word",
          }}
        >
          {reason}
        </p>

        {canRetry && (
          <button
            type="button"
            onClick={() => startScan.mutate()}
            disabled={startScan.isPending}
            className="inline-flex items-center mt-8 gt-btn"
            style={{
              background: "var(--accent)",
              color: "var(--text-inverse)",
              padding: "12px 20px",
              borderRadius: 6,
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: "0.04em",
              gap: 8,
            }}
          >
            {startScan.isPending ? "Queuing…" : "Retry scan →"}
          </button>
        )}

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
    </main>
  );
}

function NoScanYet({ wallet }: { wallet: string }) {
  // v1 demo: POST /scan is unauthenticated (SIWS gate removed for the
  // paste-wallet flow). Auto-trigger the scan on mount so the user
  // who just submitted on the landing page sees the scanning view
  // immediately rather than having to click a second button.
  const startScan = useStartScan(wallet);
  const triggered = useRef(false);

  useEffect(() => {
    if (triggered.current) return;
    if (startScan.isPending || startScan.isSuccess) return;
    triggered.current = true;
    startScan.mutate();
  }, [startScan]);

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <p className="text-label">Wallet</p>
        <h1 className="text-h1 mt-3">
          {startScan.isError ? "Scan failed to start." : "Queuing scan…"}
        </h1>
        <p
          className="mt-3"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 15,
            lineHeight: 1.6,
            color: "var(--text-secondary)",
          }}
        >
          {startScan.isError
            ? "We couldn't reach the scan service. Try again in a moment."
            : "Spinning up a forensic scan of this wallet."}
        </p>

        {startScan.isError && (
          <button
            type="button"
            onClick={() => {
              triggered.current = true;
              startScan.mutate();
            }}
            disabled={startScan.isPending}
            className="inline-flex items-center mt-8 gt-btn"
            style={{
              background: "var(--accent)",
              color: "var(--text-inverse)",
              padding: "12px 20px",
              borderRadius: 6,
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: "0.04em",
              gap: 8,
            }}
          >
            {startScan.isPending ? "Queuing…" : "Retry scan →"}
          </button>
        )}

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
    </main>
  );
}

function CenterMessage({ label, detail }: { label: string; detail?: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center">
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            color: "var(--text-secondary)",
            letterSpacing: "0.08em",
          }}
        >
          {label}
        </p>
        {detail && (
          <p
            className="mt-2"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--threat-red)",
            }}
          >
            {detail}
          </p>
        )}
      </div>
    </main>
  );
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}
