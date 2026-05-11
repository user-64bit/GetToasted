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
  const sandwichesQ = useWalletSandwiches(
    wallet,
    { limit: 25 },
    { refetchInterval: 2000 },
  );

  const progress = summary.scanProgress;
  const progressPct = progress?.progressPct ?? 0;
  const transactionsAnalyzed = progress?.signaturesProcessed ?? 0;
  const sandwichesFound = progress?.sandwichesFound ?? summary.sandwichCount;

  const isQueued =
    summary.scanStatus === "pending" ||
    (progress == null && transactionsAnalyzed === 0);
  const status = isQueued
    ? "Queued — waiting for scanner worker"
    : transactionsAnalyzed === 0
      ? "Fetching first batch from Helius"
      : undefined;

  const recent = (sandwichesQ.data?.data ?? []).map(rowToSandwich);

  return (
    <main style={{ minHeight: "100vh" }}>
      <DashboardTopbar wallet={wallet} />
      <div className="px-5 py-12 md:px-10 md:py-16">
        <div className="mx-auto w-full max-w-4xl">
          <p
            className="text-kicker"
            style={{ marginBottom: 16, color: "var(--accent)" }}
          >
            § FORENSIC SCAN / IN PROGRESS
          </p>
          <h1
            className="text-h1"
            style={{ color: "var(--text-primary)", maxWidth: 720 }}
          >
            Pulling every transaction.
            <br />
            <em>Reading every slot.</em>
          </h1>
          <p
            className="text-body-sm"
            style={{
              maxWidth: 620,
              marginTop: 16,
            }}
          >
            Detections appear as soon as the worker persists confirmed or
            suspected sandwich brackets. Live stream below.
          </p>

          <div className="mt-10">
            <ScanProgress
              progress={progressPct}
              sandwichesFound={sandwichesFound}
              transactionsAnalyzed={transactionsAnalyzed}
              walletAddress={shortAddress(wallet)}
              status={status}
            />
          </div>

          <div className="mt-10">
            <p
              className="text-kicker"
              style={{
                marginBottom: 16,
                color:
                  recent.length > 0
                    ? "var(--threat-red)"
                    : "var(--text-tertiary)",
              }}
            >
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
                  border: "1px dashed var(--border-subtle)",
                  background: "var(--bg-surface)",
                  padding: 22,
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-tertiary)",
                  fontSize: 12,
                  letterSpacing: "0.05em",
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
