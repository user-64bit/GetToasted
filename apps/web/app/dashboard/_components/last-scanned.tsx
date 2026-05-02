"use client";

import { useState } from "react";
import { useStartScan } from "../../lib/api/wallets";

interface LastScannedProps {
  wallet: string;
  lastScanAt: string | null;
}

// 6h matches the BLOCK_TIME_TTL constant in the runtime package — past this
// the on-chain context cache is also being rewarmed, so a re-scan picks up
// fresh data without paying double for warm-cache misses.
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

export function LastScanned({ wallet, lastScanAt }: LastScannedProps) {
  const startScan = useStartScan(wallet);
  // Capture "now" once at mount so react-hooks/purity is satisfied. The
  // staleness label is read-once — users can re-scan and the page reloads.
  const [now] = useState(() => Date.now());

  const ts = lastScanAt ? new Date(lastScanAt).getTime() : null;
  const ageMs = ts !== null ? now - ts : null;
  const stale = ageMs !== null && ageMs > STALE_AFTER_MS;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.04em",
          color: stale ? "var(--threat-red)" : "var(--text-secondary)",
          opacity: stale ? 0.95 : 0.7,
        }}
      >
        {ts !== null
          ? `Last scanned ${formatRelative(ageMs!)}${stale ? " · stale" : ""}`
          : "Never scanned"}
      </span>
      <button
        type="button"
        onClick={() => startScan.mutate()}
        disabled={startScan.isPending}
        style={{
          background: "transparent",
          border: "1px solid var(--border-default)",
          borderRadius: 6,
          padding: "6px 12px",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--text-primary)",
          cursor: startScan.isPending ? "wait" : "pointer",
          letterSpacing: "0.04em",
          opacity: startScan.isPending ? 0.5 : 1,
        }}
      >
        {startScan.isPending ? "Queuing…" : "Re-scan"}
      </button>
    </div>
  );
}

function formatRelative(ms: number): string {
  if (ms < 60_000) return "just now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}
