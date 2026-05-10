import { MonoNumber } from "@get-toasted/ui/mono-number";
import type { ThreatLevel } from "@get-toasted/ui/types";
import type { DashboardData } from "./view-model";

interface KpiRowProps {
  data: DashboardData;
}

export function KpiRow({ data }: KpiRowProps) {
  return (
    <div className="flex flex-col gap-4">
      <HeroKpi data={data} />
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Kpi label="Attacks found" subline="lifetime">
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 26 }}>
            <MonoNumber
              value={data.attacksFound}
              decimals={0}
              color="threat"
              animated
            />
          </span>
        </Kpi>

        <Kpi
          label="Worst attacker"
          subline={
            data.worstAttacker
              ? `${data.worstAttacker.count} attacks on you`
              : "—"
          }
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 18,
              fontWeight: 500,
              color: "var(--threat-red)",
              wordBreak: "break-all",
            }}
          >
            {data.worstAttacker?.name ?? "None"}
          </span>
        </Kpi>

        <Kpi label="Risk level" subline={riskSubline(data.riskLevel)}>
          <RiskDisplay level={data.riskLevel} />
        </Kpi>
      </div>
    </div>
  );
}

function HeroKpi({ data }: { data: DashboardData }) {
  const isThreat = data.attacksFound > 0;
  return (
    <div
      style={{
        position: "relative",
        background: "var(--bg-surface)",
        border: `1px solid ${isThreat ? "var(--threat-red-border)" : "var(--border-subtle)"}`,
        borderRadius: 8,
        padding: "28px 28px 24px",
        overflow: "hidden",
      }}
    >
      {isThreat && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(60% 80% at 0% 100%, var(--threat-red-dim), transparent 70%)",
            pointerEvents: "none",
          }}
        />
      )}
      <div style={{ position: "relative" }}>
        <p className="text-label">Total extracted from this wallet</p>
        <div
          className="mt-3"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "clamp(40px, 8vw, 64px)",
            lineHeight: 1.05,
            letterSpacing: -0.5,
            color: "var(--threat-red)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <MonoNumber
            value={data.totalLossUsd}
            prefix="$"
            color="threat"
            animated
            durationMs={720}
          />
        </div>
        <p
          className="mt-3"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--text-secondary)",
            letterSpacing: 0,
          }}
        >
          across {data.attacksFound.toLocaleString("en-US")} confirmed and
          suspected sandwich {data.attacksFound === 1 ? "attack" : "attacks"} ·
          {" "}
          {data.transactionsAnalyzed.toLocaleString("en-US")} transactions
          analyzed
        </p>
      </div>
    </div>
  );
}

function Kpi({
  label,
  subline,
  children,
}: {
  label: string;
  subline?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 8,
        padding: 20,
      }}
    >
      <p className="text-label">{label}</p>
      <div className="mt-2" style={{ minHeight: 32 }}>
        {children}
      </div>
      {subline && (
        <p
          className="mt-1"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-secondary)",
            letterSpacing: 0,
          }}
        >
          {subline}
        </p>
      )}
    </div>
  );
}

function RiskDisplay({ level }: { level: ThreatLevel }) {
  const color =
    level === "high"
      ? "var(--threat-red)"
      : level === "medium"
        ? "var(--threat-amber)"
        : level === "low"
          ? "var(--safe-green)"
          : "var(--text-secondary)";
  const text =
    level === "none"
      ? "CLEAN"
      : level === "low"
        ? "LOW"
        : level === "medium"
          ? "MED"
          : "HIGH";
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 32,
        fontWeight: 500,
        color,
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        letterSpacing: 0,
      }}
    >
      {level === "high" && (
        <span
          aria-hidden
          className="inline-block rounded-full"
          style={{
            width: 10,
            height: 10,
            background: "var(--threat-red)",
            animation: "threat-pulse 2s infinite",
          }}
        />
      )}
      {text}
    </span>
  );
}

function riskSubline(level: ThreatLevel): string {
  if (level === "high") return "active threats";
  if (level === "medium") return "Some exposure detected";
  if (level === "low") return "Minimal exposure";
  return "No exposure";
}
