import { MonoNumber } from "@get-toasted/ui/mono-number";
import type { ThreatLevel } from "@get-toasted/ui/types";
import { StatBand, type StatCellData } from "../../_components/stat-band";
import type { DashboardData } from "./view-model";

interface KpiRowProps {
  data: DashboardData;
}

export function KpiRow({ data }: KpiRowProps) {
  return (
    <div className="flex flex-col gap-6">
      <LossReadout data={data} />
      <StatBand cells={buildCells(data)} />
    </div>
  );
}

/**
 * The total loss as an instrument readout — tabular mono, exact, no serif
 * theatre and no radial glow. The number is the evidence.
 */
function LossReadout({ data }: { data: DashboardData }) {
  const isThreat = data.attacksFound > 0;
  return (
    <div
      className="panel"
      style={{
        borderColor: isThreat ? "var(--threat-red-border)" : "var(--border-subtle)",
        borderLeft: `2px solid ${isThreat ? "var(--threat-red)" : "var(--border-strong)"}`,
        padding: "26px 28px",
      }}
    >
      <p className="text-label" style={{ color: isThreat ? "var(--threat-red)" : "var(--text-secondary)" }}>
        Total extracted from this wallet
      </p>
      <div style={{ marginTop: 16, lineHeight: 1 }}>
        <MonoNumber
          value={data.totalLossUsd}
          prefix="$"
          color="threat"
          animated
          durationMs={720}
          fontWeight={500}
          letterSpacing="-0.02em"
          className="text-display-num"
        />
      </div>
      <p
        style={{
          marginTop: 14,
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "var(--text-tertiary)",
        }}
      >
        across {data.attacksFound.toLocaleString("en-US")} confirmed and suspected
        {data.attacksFound === 1 ? " attack" : " attacks"} ·{" "}
        {data.transactionsAnalyzed.toLocaleString("en-US")} transactions analyzed
      </p>
    </div>
  );
}

const NUM_STYLE = {
  fontFamily: "var(--font-mono)",
  fontSize: "clamp(30px, 4vw, 46px)",
  fontWeight: 500,
  letterSpacing: "-0.02em",
  lineHeight: 1,
  display: "inline-block",
  fontVariantNumeric: "tabular-nums",
} as const;

function buildCells(data: DashboardData): StatCellData[] {
  const worstLabel = data.worstAttacker
    ? data.worstAttacker.name.length > 14
      ? `${data.worstAttacker.name.slice(0, 12)}…`
      : data.worstAttacker.name
    : "None";

  return [
    {
      label: "Attacks found",
      source: "Lifetime",
      tone: data.attacksFound > 0 ? "threat" : "default",
      value: (
        <span style={NUM_STYLE}>
          <MonoNumber
            value={data.attacksFound}
            decimals={0}
            color={data.attacksFound > 0 ? "threat" : "default"}
            animated
            fontWeight={500}
            letterSpacing="-0.02em"
          />
        </span>
      ),
    },
    {
      label: "Worst attacker",
      source: data.worstAttacker ? `${data.worstAttacker.count} hits on you` : "—",
      tone: data.attacksFound > 0 ? "threat" : "default",
      value: (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "clamp(18px, 2.4vw, 26px)",
            fontWeight: 500,
            letterSpacing: "-0.01em",
            color: data.attacksFound > 0 ? "var(--threat-red)" : "var(--text-primary)",
            wordBreak: "break-word",
            display: "inline-block",
            lineHeight: 1.1,
          }}
        >
          {worstLabel}
        </span>
      ),
    },
    {
      label: "Transactions analyzed",
      source: "Forensic window",
      value: (
        <span style={NUM_STYLE}>
          <MonoNumber value={data.transactionsAnalyzed} decimals={0} fontWeight={500} letterSpacing="-0.02em" />
        </span>
      ),
    },
    {
      label: "Risk level",
      source: riskSubline(data.riskLevel),
      tone:
        data.riskLevel === "high" ? "threat" : data.riskLevel === "medium" ? "amber" : "default",
      value: <RiskDisplay level={data.riskLevel} />,
    },
  ];
}

function RiskDisplay({ level }: { level: ThreatLevel }) {
  const color =
    level === "high"
      ? "var(--threat-red)"
      : level === "medium"
        ? "var(--threat-amber)"
        : level === "low"
          ? "var(--safe-green)"
          : "var(--safe-green)";
  const text =
    level === "none" ? "CLEAN" : level === "low" ? "LOW" : level === "medium" ? "MED" : "HIGH";
  return (
    <span
      className="tnum"
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "clamp(24px, 3.2vw, 38px)",
        fontWeight: 600,
        letterSpacing: "0.02em",
        color,
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        lineHeight: 1,
      }}
    >
      {level === "high" ? <span className="dot dot-threat" style={{ width: 9, height: 9 }} /> : null}
      {text}
    </span>
  );
}

function riskSubline(level: ThreatLevel): string {
  if (level === "high") return "Active threats";
  if (level === "medium") return "Some exposure";
  if (level === "low") return "Minimal exposure";
  return "No exposure";
}
