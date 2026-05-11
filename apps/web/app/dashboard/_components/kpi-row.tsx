import { MonoNumber } from "@get-toasted/ui/mono-number";
import type { ThreatLevel } from "@get-toasted/ui/types";
import { StatBand, type StatCellData } from "../../_components/stat-band";
import type { DashboardData } from "./view-model";

interface KpiRowProps {
  data: DashboardData;
}

export function KpiRow({ data }: KpiRowProps) {
  return (
    <div className="flex flex-col gap-8">
      <HeroLossCallout data={data} />
      <StatBand cells={buildCells(data)} />
    </div>
  );
}

/**
 * The single emotionally-weighted Fraunces moment in the tool register —
 * the dollar figure rendered as a serif display number, with mono caption
 * underneath. Per design rule: Fraunces only on this number.
 */
function HeroLossCallout({ data }: { data: DashboardData }) {
  const isThreat = data.attacksFound > 0;
  return (
    <div
      style={{
        position: "relative",
        background: "var(--bg-surface)",
        border: `1px solid ${
          isThreat ? "var(--threat-red-border)" : "var(--border-subtle)"
        }`,
        padding: "32px 32px 28px",
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
        <p className="text-kicker" style={{ marginBottom: 0 }}>
          Total extracted from this wallet
        </p>
        <div style={{ marginTop: 18, lineHeight: 1 }}>
          <MonoNumber
            value={data.totalLossUsd}
            prefix="$"
            color="threat"
            animated
            durationMs={720}
            fontFamily="var(--font-display-family)"
            fontWeight={400}
            letterSpacing="-0.03em"
            className="text-display-num"
          />
        </div>
        <p
          style={{
            marginTop: 14,
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--text-secondary)",
            letterSpacing: 0,
          }}
        >
          across {data.attacksFound.toLocaleString("en-US")} confirmed and
          suspected sandwich {data.attacksFound === 1 ? "attack" : "attacks"} ·{" "}
          {data.transactionsAnalyzed.toLocaleString("en-US")} transactions
          analyzed
        </p>
      </div>
    </div>
  );
}

const STAT_NUM_STYLE = {
  fontSize: "clamp(40px, 5vw, 64px)",
  fontWeight: 300,
  letterSpacing: "-0.03em",
  lineHeight: 1,
  display: "inline-block",
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
        <span style={STAT_NUM_STYLE}>
          <MonoNumber
            value={data.attacksFound}
            decimals={0}
            color={data.attacksFound > 0 ? "threat" : "default"}
            animated
            fontFamily="var(--font-display-family)"
            fontWeight={400}
            letterSpacing="-0.03em"
          />
        </span>
      ),
    },
    {
      label: "Worst attacker",
      source: data.worstAttacker
        ? `${data.worstAttacker.count} attacks on you`
        : "—",
      tone: data.attacksFound > 0 ? "threat" : "default",
      value: (
        <span
          style={{
            fontFamily: "var(--font-display-family)",
            fontSize: "clamp(26px, 3.4vw, 40px)",
            fontWeight: 400,
            letterSpacing: "-0.02em",
            color:
              data.attacksFound > 0
                ? "var(--threat-red)"
                : "var(--text-primary)",
            wordBreak: "break-word",
            display: "inline-block",
            lineHeight: 1.05,
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
        <span style={STAT_NUM_STYLE}>
          <MonoNumber
            value={data.transactionsAnalyzed}
            decimals={0}
            fontFamily="var(--font-display-family)"
            fontWeight={400}
            letterSpacing="-0.03em"
          />
        </span>
      ),
    },
    {
      label: "Risk level",
      source: riskSubline(data.riskLevel),
      tone:
        data.riskLevel === "high"
          ? "threat"
          : data.riskLevel === "medium"
            ? "amber"
            : "default",
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
          : "var(--text-secondary)";
  const text =
    level === "none"
      ? "Clean"
      : level === "low"
        ? "Low"
        : level === "medium"
          ? "Med"
          : "High";
  return (
    <span
      style={{
        fontFamily: "var(--font-display-family)",
        fontSize: "clamp(36px, 5vw, 56px)",
        fontWeight: 300,
        letterSpacing: "-0.03em",
        color,
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        lineHeight: 1,
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
      <em
        style={{
          fontStyle: "italic",
          color,
        }}
      >
        {text}
      </em>
    </span>
  );
}

function riskSubline(level: ThreatLevel): string {
  if (level === "high") return "Active threats";
  if (level === "medium") return "Some exposure";
  if (level === "low") return "Minimal exposure";
  return "No exposure";
}
