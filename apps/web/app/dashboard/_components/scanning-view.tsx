"use client";

import { ScanProgress } from "@get-toasted/ui/scan-progress";
import { SandwichCard } from "@get-toasted/ui/sandwich-card";
import { useWalletSandwiches } from "../../lib/api/wallets";
import type { WalletSummary } from "../../lib/api/types";
import { DashboardTopbar } from "./dashboard-topbar";
import { rowToSandwich } from "./view-model";

interface ScanningViewProps {
  wallet: string;
  summary: WalletSummary;
}

function shortAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

export function ScanningView({ wallet, summary }: ScanningViewProps) {
  // Refetch every 2s while scanning so detections appear live as the
  // worker writes them to detected_sandwiches. Stops once the parent
  // dashboard-client transitions us out (scanStatus !== scanning|pending).
  const sandwichesQ = useWalletSandwiches(
    wallet,
    { limit: 25 },
    { refetchInterval: 2000 },
  );

  const progress = summary.scanProgress;
  const progressPct = progress?.progressPct ?? 0;
  const transactionsAnalyzed = progress?.signaturesProcessed ?? 0;
  const sandwichesFound = progress?.sandwichesFound ?? summary.sandwichCount;

  // "pending" = queued, worker hasn't started; "scanning" but 0 sigs = worker
  // is in its first Helius call. Surfacing this so 0/0/0% isn't a mystery.
  const isQueued =
    summary.scanStatus === "pending" || (progress == null && transactionsAnalyzed === 0);
  const status = isQueued
    ? "Queued — waiting for scanner worker"
    : transactionsAnalyzed === 0
    ? "Fetching first batch from Helius"
    : undefined;

  const recent = (sandwichesQ.data?.data ?? []).map(rowToSandwich);

  return (
    <main style={{ minHeight: "100vh" }}>
      <DashboardTopbar wallet={wallet} />
      <div
        className="flex items-center justify-center px-4 py-10 md:px-6"
        style={{ minHeight: "calc(100vh - 56px)" }}
      >
        <div className="mx-auto w-full max-w-4xl">
          <p className="text-label">Dashboard / scanning</p>
          <h1 className="text-h1 mt-3">Forensic scan in progress</h1>
          <p
            className="mt-3"
            style={{
              maxWidth: 620,
              fontFamily: "var(--font-sans)",
              fontSize: 15,
              lineHeight: 1.55,
              color: "var(--text-secondary)",
            }}
          >
            Detections appear as soon as the worker persists confirmed or
            suspected sandwich brackets.
          </p>

          <div className="mt-8">
            <ScanProgress
              progress={progressPct}
              sandwichesFound={sandwichesFound}
              transactionsAnalyzed={transactionsAnalyzed}
              walletAddress={shortAddress(wallet)}
              status={status}
            />
          </div>

          <div className="mt-8">
            <p className="text-label" style={{ marginBottom: 12 }}>
              Live detection stream / {recent.length}
            </p>
            {recent.length > 0 ? (
              <div className="flex flex-col gap-3">
                {recent.map((s) => (
                  <SandwichCard key={s.id} sandwich={s} isNew />
                ))}
              </div>
            ) : (
              <div
                style={{
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-panel)",
                  background: "var(--bg-surface)",
                  padding: 18,
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-tertiary)",
                  fontSize: 13,
                }}
              >
                No detections persisted yet. The stream will update during the
                scan.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
