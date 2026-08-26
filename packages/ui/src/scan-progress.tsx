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
  if (p < 8) return "Waiting for a scanner worker";
  if (p < 34) return "Pulling transaction history";
  if (p < 64) return "Decoding swaps and block context";
  if (p < 92) return "Testing sandwich brackets";
  if (p < 100) return "Pricing the exposure";
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
  const accent = hasThreats ? "var(--threat-red)" : "var(--accent)";

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

  const activeStage = useMemo(
    () => [...STAGES].reverse().find((s) => clamped >= s.threshold) ?? STAGES[0]!,
    [clamped],
  );

  return (
    <section className={cn("panel", className)} style={{ overflow: "hidden" }}>
      <div className="panel-hd" style={{ fontFamily: "var(--font-mono)" }}>
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={hasThreats ? "dot dot-threat" : "dot dot-live"} />
          <span
            style={{
              color: accent,
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            Live scan
          </span>
          <span className="truncate" style={{ color: "var(--text-tertiary)", fontSize: 12 }}>
            {walletAddress}
          </span>
        </div>
        <span className="tnum" style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
          T+{formatElapsed(elapsed)}
        </span>
      </div>

      <div className="panel-bd">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]" style={{ alignItems: "end" }}>
          <div>
            <p className="text-label">Current operation</p>
            <p
              style={{
                marginTop: 8,
                fontFamily: "var(--font-mono)",
                fontSize: 16,
                color: "var(--text-primary)",
              }}
            >
              <span style={{ color: accent }}>&gt;</span> {displayStatus}
              {clamped < 100 ? (
                <span className="gt-scan-dots" aria-hidden>
                  <span>.</span>
                  <span>.</span>
                  <span>.</span>
                </span>
              ) : null}
            </p>
          </div>
          <div
            className="tnum"
            style={{ fontFamily: "var(--font-mono)", fontSize: 40, lineHeight: 1, color: accent }}
          >
            {Math.round(clamped)}%
          </div>
        </div>

        <div
          style={{
            position: "relative",
            height: 6,
            background: "var(--bg-field)",
            borderRadius: 999,
            overflow: "hidden",
            marginTop: 18,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              width: `${clamped}%`,
              background: accent,
              borderRadius: 999,
              transition: "width var(--duration-slow) var(--ease-out)",
            }}
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-1.5">
          {STAGES.map((stage) => {
            const state =
              clamped >= stage.threshold
                ? stage.key === activeStage.key
                  ? "active"
                  : "done"
                : "pending";
            return (
              <span
                key={stage.key}
                className="chip"
                style={{
                  borderColor: state === "active" ? accent : "var(--border-subtle)",
                  color:
                    state === "active"
                      ? accent
                      : state === "done"
                        ? "var(--text-secondary)"
                        : "var(--text-muted)",
                  background: state === "active" ? "var(--bg-overlay)" : "transparent",
                }}
              >
                {stage.label}
              </span>
            );
          })}
        </div>

        <div
          className="mt-6 grid grid-cols-2 sm:grid-cols-4"
          style={{
            background: "var(--border-subtle)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-panel)",
            overflow: "hidden",
            gap: 1,
          }}
        >
          <StatTile label="Transactions">
            <MonoNumber value={transactionsAnalyzed} decimals={0} animated durationMs={600} />
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
            <span className="tnum">{formatElapsed(elapsed)}</span>
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
    <div style={{ background: "var(--bg-surface)", padding: "14px 16px", minHeight: 82 }}>
      <p className="text-label" style={{ marginBottom: 8 }}>
        {label}
      </p>
      <p
        className="tnum"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 22,
          fontWeight: 500,
          color: threat ? "var(--threat-red)" : "var(--text-primary)",
        }}
      >
        {children}
      </p>
    </div>
  );
}
