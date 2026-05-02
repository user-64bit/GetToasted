"use client";

import { useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useMe } from "../../lib/api/auth";
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
  const summaryQ = useWalletSummary(wallet, {
    refetchInterval: (q) => {
      const status = q.state.data?.scanStatus;
      return status === "scanning" || status === "pending" ? 2000 : false;
    },
  });

  const sandwichesQ = useWalletSandwiches(wallet, { limit: 100 });

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

  const status = summaryQ.data?.scanStatus ?? "unknown";

  if (status === "unknown") {
    return <NoScanYet wallet={wallet} />;
  }

  if (status === "scanning" || status === "pending") {
    return <ScanningView wallet={wallet} summary={summaryQ.data!} />;
  }

  if (!data) {
    return <CenterMessage label="Loading attacks…" />;
  }

  return <CompleteView wallet={wallet} data={data} />;
}

function NoScanYet({ wallet }: { wallet: string }) {
  const me = useMe();
  const { connected, publicKey } = useWallet();
  const startScan = useStartScan(wallet);

  const isOwnWallet =
    me.data?.authenticated && me.data.address === wallet;
  const walletConnected = connected && publicKey?.toBase58() === wallet;
  const canScan = isOwnWallet || walletConnected;

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <p className="text-label">Wallet</p>
        <h1 className="text-h1 mt-3">No scan yet.</h1>
        <p
          className="mt-3"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 15,
            lineHeight: 1.6,
            color: "var(--text-secondary)",
          }}
        >
          {canScan
            ? "Kick off a forensic scan of this wallet to find every sandwich attack."
            : "Sign in with this wallet on the home page to start a scan."}
        </p>

        {canScan && (
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
            {startScan.isPending ? "Queuing…" : "Start scan →"}
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
