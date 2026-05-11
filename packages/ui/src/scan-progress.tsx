"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MonoNumber } from "./mono-number";
import { cn } from "./utils";

export interface ScanProgressProps {
  /** 0-100 */
  progress: number;
  sandwichesFound: number;
  transactionsAnalyzed: number;
  walletAddress: string;
  status?: string;
  className?: string;
}

const STAGES = [
  { key: "queue", label: "Queue", threshold: 0 },
  { key: "fetch", label: "Fetch", threshold: 8 },
  { key: "decode", label: "Decode", threshold: 34 },
  { key: "detect", label: "Detect", threshold: 64 },
  { key: "score", label: "Score", threshold: 92 },
] as const;

function deriveStatus(p: number): string {
  if (p < 8) return "Waiting for scanner worker";
  if (p < 34) return "Fetching wallet transaction history";
  if (p < 64) return "Decoding swaps and block context";
  if (p < 92) return "Testing sandwich brackets";
  if (p < 100) return "Computing exposure metrics";
  return "Report ready";
}

function formatElapsed(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function ScanProgress({
  progress,
  sandwichesFound,
  transactionsAnalyzed,
  walletAddress,
  status,
  className,
}: ScanProgressProps) {
  const clamped = Math.max(0, Math.min(100, progress));
  const displayStatus = status ?? deriveStatus(clamped);
  const hasThreats = sandwichesFound > 0;

  const startedAt = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (clamped >= 100) return;
    const startedAtMs = startedAt.current ?? Date.now();
    startedAt.current = startedAtMs;
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtMs) / 1000));
    }, 500);
    return () => window.clearInterval(id);
  }, [clamped]);

  const activeStage = useMemo(() => {
    return [...STAGES].reverse().find((s) => clamped >= s.threshold) ?? STAGES[0]!;
  }, [clamped]);

  return (
    <section
      className={cn("w-full", className)}
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-panel)",
        overflow: "hidden",
      }}
    >
      <header
        className="flex flex-wrap items-center justify-between gap-3"
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--border-subtle)",
          fontFamily: "var(--font-mono)",
        }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`gt-scan-pulse-dot ${hasThreats ? "" : "brand"}`}
            aria-hidden
          />
          <span
            style={{
              color: hasThreats ? "var(--threat-red)" : "var(--accent)",
              fontSize: 11,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
            }}
          >
            Live forensic scan
          </span>
          <span
            className="truncate"
            style={{
              color: "var(--text-secondary)",
              fontSize: 12,
            }}
          >
            {walletAddress}
          </span>
        </div>
        <span
          style={{
            color: "var(--text-tertiary)",
            fontSize: 11,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          T+{formatElapsed(elapsed)}
        </span>
      </header>

      <div style={{ padding: 20 }}>
        <div
          className="grid gap-3 sm:grid-cols-[1fr_auto]"
          style={{
            alignItems: "end",
          }}
        >
          <div>
            <p className="text-label">Current operation</p>
            <p
              className="mt-2"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 18,
                color: "var(--text-primary)",
              }}
            >
              <span style={{ color: "var(--accent-strong)" }}>&gt;</span>{" "}
              {displayStatus}
              <span className="gt-scan-dots" aria-hidden>
                <span>.</span>
                <span>.</span>
                <span>.</span>
              </span>
            </p>
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 42,
              lineHeight: 1,
              color: hasThreats ? "var(--threat-red)" : "var(--text-primary)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {Math.round(clamped)}%
          </div>
        </div>

        <div
          style={{
            position: "relative",
            height: 8,
            background: "var(--bg-field)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 999,
            overflow: "hidden",
            marginTop: 18,
          }}
        >
          <div
            className="gt-scan-shimmer"
            style={{
              position: "absolute",
              inset: 0,
              width: `${clamped}%`,
              background: hasThreats
                ? "linear-gradient(90deg, var(--threat-amber), var(--threat-red))"
                : "linear-gradient(90deg, var(--accent), var(--accent-strong))",
              transition: "width var(--duration-slow) var(--ease-out)",
            }}
          />
        </div>

        <div
          className="mt-6 grid gap-2 sm:grid-cols-5"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
          }}
        >
          {STAGES.map((stage) => {
            const state =
              clamped >= stage.threshold
                ? stage.key === activeStage.key
                  ? "active"
                  : "done"
                : "pending";
            return (
              <div
                key={stage.key}
                style={{
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-chip)",
                  padding: "8px 10px",
                  background:
                    state === "active"
                      ? "var(--bg-overlay)"
                      : "var(--bg-field)",
                  color:
                    state === "active"
                      ? hasThreats
                        ? "var(--threat-red)"
                        : "var(--accent-strong)"
                      : state === "done"
                        ? "var(--text-secondary)"
                        : "var(--text-muted)",
                  textTransform: "uppercase",
                }}
              >
                {stage.label}
              </div>
            );
          })}
        </div>

        <div
          className="mt-6 grid grid-cols-2 gap-px sm:grid-cols-4"
          style={{
            background: "var(--border-subtle)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-panel)",
            overflow: "hidden",
          }}
        >
          <StatTile label="Transactions">
            <MonoNumber
              value={transactionsAnalyzed}
              decimals={0}
              animated
              durationMs={600}
            />
          </StatTile>
          <StatTile label="Detections" threat={hasThreats}>
            <MonoNumber
              value={sandwichesFound}
              decimals={0}
              color={hasThreats ? "threat" : "default"}
              animated
              durationMs={420}
            />
          </StatTile>
          <StatTile label="Elapsed">
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {formatElapsed(elapsed)}
            </span>
          </StatTile>
          <StatTile label="Stage">{activeStage.label}</StatTile>
        </div>
      </div>
    </section>
  );
}

function StatTile({
  label,
  threat,
  children,
}: {
  label: string;
  threat?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        padding: "14px 16px",
        position: "relative",
        minHeight: 86,
      }}
    >
      <p className="text-label" style={{ marginBottom: 8 }}>
        {label}
      </p>
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 22,
          fontWeight: 500,
          color: threat ? "var(--threat-red)" : "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {children}
      </p>
      {threat ? (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            width: 2,
            background: "var(--threat-red)",
          }}
        />
      ) : null}
    </div>
  );
}
