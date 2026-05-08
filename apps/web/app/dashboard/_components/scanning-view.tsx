"use client";

import { ScanProgress } from "@get-toasted/ui/scan-progress";
import { SandwichCard } from "@get-toasted/ui/sandwich-card";
import { useWalletSandwiches } from "../../lib/api/wallets";
import type { WalletSummary } from "../../lib/api/types";
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
    <div
      className="flex items-center justify-center px-6"
      style={{ minHeight: "100vh" }}
    >
      <div className="max-w-3xl mx-auto w-full">
        <ScanProgress
          progress={progressPct}
          sandwichesFound={sandwichesFound}
          transactionsAnalyzed={transactionsAnalyzed}
          walletAddress={shortAddress(wallet)}
          status={status}
        />

        {recent.length > 0 && (
          <div className="mt-16">
            <p className="text-label" style={{ marginBottom: 16 }}>
              Detected · {recent.length}
            </p>
            <div className="flex flex-col gap-3">
              {recent.map((s) => (
                <SandwichCard key={s.id} sandwich={s} isNew />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
