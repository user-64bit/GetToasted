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
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function ScanningView({ wallet, summary }: ScanningViewProps) {
  const sandwichesQ = useWalletSandwiches(wallet, { limit: 25 }, { refetchInterval: 2000 });

  const progress = summary.scanProgress;
  const progressPct = progress?.progressPct ?? 0;
  const transactionsAnalyzed = progress?.signaturesProcessed ?? 0;
  const sandwichesFound = progress?.sandwichesFound ?? summary.sandwichCount;

  const isQueued =
    summary.scanStatus === "pending" || (progress == null && transactionsAnalyzed === 0);
  const status = isQueued
    ? "Queued — waiting for a scanner worker"
    : transactionsAnalyzed === 0
      ? "Fetching the first batch from Helius"
      : undefined;

  const recent = (sandwichesQ.data?.data ?? []).map(rowToSandwich);

  return (
    <main style={{ minHeight: "100vh" }}>
      <DashboardTopbar wallet={wallet} />
      <div className="py-12 md:py-16">
        <div className="wrap" style={{ maxWidth: 880 }}>
          <p className="text-kicker" style={{ marginBottom: 14 }}>
            Forensic scan · in progress
          </p>
          <h1 className="text-h1" style={{ color: "var(--text-primary)", maxWidth: 640 }}>
            Reading every slot this wallet touched.
          </h1>
          <p className="text-body-sm" style={{ maxWidth: 600, marginTop: 14 }}>
            Detections appear the moment the worker persists a confirmed or
            suspected bracket. Live below.
          </p>

          <div style={{ marginTop: 36 }}>
            <ScanProgress
              progress={progressPct}
              sandwichesFound={sandwichesFound}
              transactionsAnalyzed={transactionsAnalyzed}
              walletAddress={shortAddress(wallet)}
              status={status}
            />
          </div>

          <div style={{ marginTop: 36 }}>
            <p
              className="text-label"
              style={{
                marginBottom: 14,
                color: recent.length > 0 ? "var(--threat-red)" : "var(--text-tertiary)",
              }}
            >
              Live detection stream · {recent.length}
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
                  border: "1px dashed var(--border-default)",
                  borderRadius: "var(--radius-panel)",
                  background: "var(--bg-surface)",
                  padding: 22,
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-tertiary)",
                  fontSize: 12,
                }}
              >
                No brackets persisted yet. The stream updates as the scan runs.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
