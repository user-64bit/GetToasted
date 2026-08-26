"use client";

import { AttackerAddress } from "@get-toasted/ui/attacker-address";
import { BracketTrace } from "@get-toasted/ui/bracket-trace";
import { DetectionLayerBadge } from "@get-toasted/ui/detection-layer-badge";
import { LossValue } from "@get-toasted/ui/loss-value";
import type { Sandwich } from "@get-toasted/ui/types";
import { Fragment, useMemo, useState } from "react";
import { attackerDisplayName } from "./view-model";

const TIME_RANGES = [
  { label: "All time", value: "all" },
  { label: "Last year", value: "1y" },
  { label: "Last 90 days", value: "90d" },
  { label: "Last 30 days", value: "30d" },
] as const;

type TimeRange = (typeof TIME_RANGES)[number]["value"];

const TIME_RANGE_DAYS: Record<TimeRange, number | null> = {
  all: null,
  "1y": 365,
  "90d": 90,
  "30d": 30,
};

interface SandwichTableProps {
  sandwiches: Sandwich[];
  referenceNow: number;
}

export function SandwichTable({ sandwiches, referenceNow }: SandwichTableProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [pool, setPool] = useState("all");
  const [attacker, setAttacker] = useState("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const pools = useMemo(
    () => Array.from(new Set(sandwiches.map((s) => s.pool))).sort(),
    [sandwiches],
  );
  const attackers = useMemo(
    () => Array.from(new Set(sandwiches.map((s) => s.attacker))),
    [sandwiches],
  );

  const filtered = useMemo(() => {
    const days = TIME_RANGE_DAYS[timeRange];
    const cutoff = days === null ? 0 : referenceNow - days * 86_400_000;
    const q = query.trim().toLowerCase();

    return sandwiches.filter((s) => {
      if (cutoff && new Date(s.detectedAt).getTime() < cutoff) return false;
      if (pool !== "all" && s.pool !== pool) return false;
      if (attacker !== "all" && s.attacker !== attacker) return false;
      if (q) {
        const hay = `${s.pool} ${s.pair} ${s.attacker} ${s.validator ?? ""} ${s.txSignature}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sandwiches, timeRange, pool, attacker, query, referenceNow]);

  const exportCsv = () => {
    const header = ["Date", "Layer", "Venue", "Pair", "Loss USD", "Attacker", "Confidence", "Slot", "Signature"];
    const rows = [
      header,
      ...filtered.map((s) => [
        new Date(s.detectedAt).toISOString(),
        s.detectionLayer ?? "legacy",
        s.pool,
        s.pair,
        s.lossUsd !== null ? s.lossUsd.toFixed(2) : "USD unknown",
        s.attacker,
        typeof s.confidence === "number" ? s.confidence.toFixed(2) : "",
        String(s.slot),
        s.txSignature,
      ]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gettoasted-export-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <header className="flex items-end justify-between flex-wrap gap-3" style={{ marginBottom: 14 }}>
        <div>
          <p className="text-label" style={{ marginBottom: 4 }}>
            Evidence ledger
          </p>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)" }}>
            {filtered.length} of {sandwiches.length} detections · click a row to reconstruct it
          </p>
        </div>
        <button type="button" onClick={exportCsv} className="btn btn-outline btn-sm">
          Export CSV
        </button>
      </header>

      <div className="flex flex-wrap gap-2" style={{ marginBottom: 14 }}>
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value as TimeRange)}
          className="field-select"
          style={{ width: "auto" }}
          aria-label="Time range"
        >
          {TIME_RANGES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <select value={pool} onChange={(e) => setPool(e.target.value)} className="field-select" style={{ width: "auto" }} aria-label="Venue">
          <option value="all">All venues</option>
          {pools.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={attacker} onChange={(e) => setAttacker(e.target.value)} className="field-select" style={{ width: "auto" }} aria-label="Attacker">
          <option value="all">All attackers</option>
          {attackers.map((a) => (
            <option key={a} value={a}>
              {attackerDisplayName(a)}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Search pool, pair, attacker, signature…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search detections"
          className="field-input"
          style={{ flex: 1, minWidth: 180 }}
        />
      </div>

      <div className="panel" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <Th>Date</Th>
                <Th>Layer</Th>
                <Th>Venue</Th>
                <Th>Pair</Th>
                <Th align="right">Loss</Th>
                <Th>Attacker</Th>
                <Th align="right">Conf.</Th>
                <Th align="right" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      padding: 36,
                      textAlign: "center",
                      color: "var(--text-tertiary)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                    }}
                  >
                    No detections match these filters.
                  </td>
                </tr>
              ) : (
                filtered.map((s) => {
                  const open = expanded === s.id;
                  return (
                    <Fragment key={s.id}>
                      <tr
                        className="sw-row"
                        onClick={() => setExpanded(open ? null : s.id)}
                        aria-expanded={open}
                        style={{ cursor: "pointer" }}
                      >
                        <Td>
                          {new Date(s.detectedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </Td>
                        <Td>
                          <DetectionLayerBadge layer={s.detectionLayer} />
                        </Td>
                        <Td>{s.pool}</Td>
                        <Td>{s.pair}</Td>
                        <Td align="right">
                          <LossValue value={s.lossUsd} outputAmount={s.lossOutputAmount} size="sm" />
                        </Td>
                        <Td onClick={(e) => e.stopPropagation()}>
                          <AttackerAddress address={s.attacker} label={s.knownBotName} />
                        </Td>
                        <Td align="right">
                          {typeof s.confidence === "number" ? s.confidence.toFixed(2) : "—"}
                        </Td>
                        <Td align="right">
                          <span
                            aria-hidden
                            style={{
                              display: "inline-block",
                              color: "var(--text-tertiary)",
                              transition: "transform var(--duration-fast) var(--ease-out)",
                              transform: open ? "rotate(180deg)" : "none",
                            }}
                          >
                            ⌄
                          </span>
                        </Td>
                      </tr>
                      {open ? (
                        <tr>
                          <td colSpan={8} style={{ padding: 0, background: "var(--bg-base)" }}>
                            <div style={{ padding: 16 }}>
                              <BracketTrace sandwich={s} />
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      style={{
        textAlign: align,
        padding: "11px 18px",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--text-tertiary)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  onClick,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <td
      onClick={onClick}
      style={{
        textAlign: align,
        padding: "12px 18px",
        fontFamily: "var(--font-mono)",
        fontSize: 13,
        color: "var(--text-primary)",
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {children}
    </td>
  );
}
