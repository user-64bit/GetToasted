import { MonoNumber } from "@get-toasted/ui/mono-number";
import type { ThreatLevel } from "@get-toasted/ui/types";
import type { DashboardMock } from "./mock-data";

interface KpiRowProps {
  data: DashboardMock;
}

export function KpiRow({ data }: KpiRowProps) {
  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      <Kpi label="Total extracted" subline="▲ all time">
        <span className="text-mono-lg">
          <MonoNumber
            value={data.totalLossUsd}
            prefix="$"
            color="threat"
            animated
          />
        </span>
      </Kpi>

      <Kpi label="Attacks found" subline="▲ lifetime">
        <span className="text-mono-lg">
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
            fontSize: 22,
            fontWeight: 500,
            color: "var(--threat-red)",
          }}
        >
          {data.worstAttacker?.name ?? "None"}
        </span>
      </Kpi>

      <Kpi label="Risk level" subline={riskSubline(data.riskLevel)}>
        <RiskDisplay level={data.riskLevel} />
      </Kpi>
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
        padding: 24,
      }}
    >
      <p className="text-label">{label}</p>
      <div className="mt-3" style={{ minHeight: 32 }}>
        {children}
      </div>
      {subline && (
        <p
          className="mt-1"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-secondary)",
            letterSpacing: "0.04em",
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
        letterSpacing: "0.04em",
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
  if (level === "high") return "● Active threats";
  if (level === "medium") return "Some exposure detected";
  if (level === "low") return "Minimal exposure";
  return "No exposure";
}
