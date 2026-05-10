"use client";

import { useEffect, useRef, useState } from "react";
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

const STAGES = [
  { key: "connect", label: "Connect", threshold: 0 },
  { key: "fetch", label: "Fetch", threshold: 8 },
  { key: "decode", label: "Decode", threshold: 35 },
  { key: "detect", label: "Detect", threshold: 65 },
  { key: "score", label: "Score", threshold: 92 },
] as const;

function deriveStatus(p: number): string {
  if (p < 8) return "Establishing Helius connection";
  if (p < 35) return "Fetching transaction history";
  if (p < 65) return "Decoding swap instructions";
  if (p < 92) return "Detecting sandwich patterns";
  if (p < 100) return "Computing risk metrics";
  return "Finalizing report";
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
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtMs) / 1000));
    }, 500);
    return () => clearInterval(id);
  }, [clamped]);

  return (
    <div className={cn("w-full", className)}>
      {/* ── Terminal header ───────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: 8,
          fontFamily: "var(--font-mono)",
          fontSize: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="gt-scan-pulse-dot" aria-hidden />
          <span
            style={{
              color: "var(--threat-red)",
              letterSpacing: "0.18em",
              fontSize: 10,
              fontWeight: 500,
              textTransform: "uppercase",
            }}
          >
            Live Scan
          </span>
          <span
            style={{
              color: "var(--text-tertiary)",
              padding: "0 6px",
            }}
          >
            ·
          </span>
          <span
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
      </div>

      {/* ── Radar centerpiece ─────────────────────────────────────────── */}
      <div
        style={{
          position: "relative",
          margin: "32px auto 24px",
          width: 280,
          height: 280,
        }}
      >
        {/* ambient bloom */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: -40,
            background: hasThreats
              ? "radial-gradient(ellipse 60% 60% at center, var(--threat-red-dim), transparent 70%)"
              : "radial-gradient(ellipse 60% 60% at center, var(--accent-dim), transparent 70%)",
            opacity: 0.6,
            transition: "background 600ms ease",
          }}
        />

        <svg
          viewBox="0 0 280 280"
          width="280"
          height="280"
          style={{ position: "relative", display: "block" }}
          aria-hidden
        >
          <defs>
            <linearGradient id="gt-radar-sweep" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--threat-red)" stopOpacity="0" />
              <stop offset="60%" stopColor="var(--threat-red)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--threat-red)" stopOpacity="0.55" />
            </linearGradient>
            <radialGradient id="gt-radar-core" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--threat-red)" stopOpacity="0.6" />
              <stop offset="60%" stopColor="var(--threat-red)" stopOpacity="0.08" />
              <stop offset="100%" stopColor="var(--threat-red)" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* core glow */}
          <circle cx="140" cy="140" r="60" fill="url(#gt-radar-core)" />

          {/* concentric rings */}
          <circle cx="140" cy="140" r="40" fill="none" stroke="var(--border-default)" strokeWidth="1" />
          <circle cx="140" cy="140" r="75" fill="none" stroke="var(--border-default)" strokeWidth="1" />
          <circle cx="140" cy="140" r="110" fill="none" stroke="var(--border-subtle)" strokeWidth="1" />
          <circle
            cx="140"
            cy="140"
            r="135"
            fill="none"
            stroke="var(--border-subtle)"
            strokeWidth="1"
            strokeDasharray="2 4"
          />

          {/* axes */}
          <line x1="0" y1="140" x2="280" y2="140" stroke="var(--border-subtle)" strokeWidth="1" />
          <line x1="140" y1="0" x2="140" y2="280" stroke="var(--border-subtle)" strokeWidth="1" />

          {/* rotating sweep — SMIL rotation pivots reliably around (140,140) */}
          <g>
            <path d="M 140 140 L 275 140 A 135 135 0 0 0 200 23 Z" fill="url(#gt-radar-sweep)" />
            <line x1="140" y1="140" x2="275" y2="140" stroke="var(--threat-red)" strokeWidth="1.5" />
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              from="0 140 140"
              to="360 140 140"
              dur="3.6s"
              repeatCount="indefinite"
            />
          </g>

          {/* radar pings (random intel pickups) */}
          <g className="gt-radar-ping gt-radar-ping-1">
            <circle cx="92" cy="68" r="2.5" fill="var(--threat-red)" />
          </g>
          <g className="gt-radar-ping gt-radar-ping-2">
            <circle cx="198" cy="112" r="2.5" fill="var(--threat-amber)" />
          </g>
          <g className="gt-radar-ping gt-radar-ping-3">
            <circle cx="78" cy="190" r="2.5" fill="var(--accent)" />
          </g>
          <g className="gt-radar-ping gt-radar-ping-4">
            <circle cx="210" cy="208" r="2.5" fill="var(--threat-red)" />
          </g>
          <g className="gt-radar-ping gt-radar-ping-5">
            <circle cx="55" cy="125" r="2.5" fill="var(--accent)" />
          </g>

          {/* center node */}
          <circle cx="140" cy="140" r="9" fill="var(--bg-void)" stroke="var(--threat-red)" strokeWidth="1.5" />
          <circle cx="140" cy="140" r="3" fill="var(--threat-red)">
            <animate attributeName="opacity" values="1;0.3;1" dur="1.6s" repeatCount="indefinite" />
          </circle>
        </svg>

        {/* center label overlay */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "calc(50% + 22px)",
            transform: "translateX(-50%)",
            textAlign: "center",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.2em",
            color: "var(--text-tertiary)",
            textTransform: "uppercase",
            pointerEvents: "none",
          }}
        >
          Target
        </div>
      </div>

      {/* ── Status line ──────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          color: "var(--text-primary)",
        }}
      >
        <span
          style={{
            color: "var(--threat-red)",
            fontWeight: 500,
          }}
        >
          &gt;
        </span>
        <span>{displayStatus}</span>
        <span className="gt-scan-dots" aria-hidden>
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      </div>

      {/* ── Progress bar with shimmer ────────────────────────────────── */}
      <div
        style={{
          position: "relative",
          height: 6,
          background: "var(--bg-elevated)",
          borderRadius: 999,
          overflow: "hidden",
          marginBottom: 18,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${clamped}%`,
            background:
              "linear-gradient(90deg, var(--accent), var(--threat-red))",
            transition: "width 600ms cubic-bezier(0.16, 1, 0.3, 1)",
            borderRadius: 999,
          }}
        />
        <div
          aria-hidden
          className="gt-scan-shimmer"
          style={{
            position: "absolute",
            inset: 0,
            width: `${clamped}%`,
            borderRadius: 999,
          }}
        />
      </div>

      {/* ── Stage rail ───────────────────────────────────────────────── */}
      <div
        style={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: `repeat(${STAGES.length}, 1fr)`,
          marginBottom: 32,
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {/* connector line */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 7,
            left: `calc(100% / ${STAGES.length} / 2)`,
            right: `calc(100% / ${STAGES.length} / 2)`,
            height: 1,
            background: "var(--border-subtle)",
            zIndex: 0,
          }}
        />
        {STAGES.map((stage, i) => {
          const next = STAGES[i + 1]?.threshold ?? 100;
          const state =
            clamped >= next
              ? "done"
              : clamped >= stage.threshold
              ? "active"
              : "pending";
          const color =
            state === "done"
              ? "var(--safe-green)"
              : state === "active"
              ? "var(--threat-red)"
              : "var(--text-tertiary)";
          return (
            <div
              key={stage.key}
              style={{
                position: "relative",
                zIndex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                className={state === "active" ? "gt-stage-active" : undefined}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: state === "pending" ? "var(--bg-elevated)" : color,
                  color: "var(--bg-void)",
                  fontSize: 9,
                  fontWeight: 700,
                  border:
                    state === "pending"
                      ? "1px solid var(--border-default)"
                      : "none",
                }}
              >
                {state === "done" ? "✓" : ""}
              </span>
              <span style={{ color, fontSize: 9 }}>{stage.label}</span>
            </div>
          );
        })}
      </div>

      {/* ── Stats grid ───────────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 1,
          background: "var(--border-subtle)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 8,
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
        <StatTile label="Attacks" threat={hasThreats}>
          <MonoNumber
            value={sandwichesFound}
            decimals={0}
            color={hasThreats ? "threat" : "default"}
            animated
            durationMs={400}
          />
        </StatTile>
        <StatTile label="Elapsed">
          <span
            style={{
              fontFamily: "var(--font-mono)",
              color: "var(--text-primary)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatElapsed(elapsed)}
          </span>
        </StatTile>
        <StatTile label="Progress">
          <span
            style={{
              fontFamily: "var(--font-mono)",
              color: "var(--text-primary)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {Math.round(clamped)}%
          </span>
        </StatTile>
      </div>
    </div>
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
      }}
    >
      <p
        className="text-label"
        style={{ marginBottom: 6, fontSize: 9 }}
      >
        {label}
      </p>
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: "-0.01em",
          color: "var(--text-primary)",
        }}
      >
        {children}
      </p>
      {threat && (
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
      )}
    </div>
  );
}
