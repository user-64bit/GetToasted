"use client";

import { MonoNumber } from "./mono-number";
import { cn } from "./utils";

export interface ScanProgressProps {
  /** 0–100 */
  progress: number;
  sandwichesFound: number;
  transactionsAnalyzed: number;
  walletAddress: string;
  status?: string;
  className?: string;
}

export function ScanProgress({
  progress,
  sandwichesFound,
  transactionsAnalyzed,
  walletAddress,
  status = "Analyzing transaction history...",
  className,
}: ScanProgressProps) {
  const clamped = Math.max(0, Math.min(100, progress));

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-baseline gap-3">
        <span className="text-label">Scanning</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}>
          {walletAddress}
        </span>
      </div>
      <p
        className="mt-1"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 13,
          color: "var(--text-secondary)",
        }}
      >
        {status}
      </p>

      <div
        className="mt-6 relative rounded-full"
        style={{ height: 4, background: "var(--bg-elevated)" }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${clamped}%`,
            background:
              "linear-gradient(90deg, var(--accent), var(--threat-red))",
            transition: "width 400ms ease-out",
          }}
        />
        <div
          aria-hidden
          className="absolute rounded-full"
          style={{
            top: "50%",
            transform: "translate(-50%, -50%)",
            left: `${clamped}%`,
            width: 8,
            height: 8,
            background: "var(--threat-red)",
            boxShadow: "0 0 8px var(--threat-red), 0 0 16px var(--threat-red)",
            opacity: clamped > 0 ? 1 : 0,
            transition: "left 400ms ease-out, opacity 200ms",
          }}
        />
      </div>

      <div
        className="mt-3 flex items-center justify-between"
        style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
      >
        <span style={{ color: "var(--text-secondary)" }}>
          <MonoNumber
            value={transactionsAnalyzed}
            decimals={0}
            animated
            durationMs={600}
          />{" "}
          transactions analyzed
          {"  ·  "}
          <MonoNumber
            value={sandwichesFound}
            decimals={0}
            color="threat"
            animated
            durationMs={400}
          />{" "}
          attacks found so far
        </span>
        <span style={{ color: "var(--text-primary)" }}>
          {Math.round(clamped)}%
        </span>
      </div>
    </div>
  );
}
