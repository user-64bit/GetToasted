"use client";

import { AttackerAddress } from "@get-toasted/ui/attacker-address";
import { DetectionLayerBadge } from "@get-toasted/ui/detection-layer-badge";
import { LossValue } from "@get-toasted/ui/loss-value";
import type { Sandwich } from "@get-toasted/ui/types";
import { useMemo, useState } from "react";
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

export function SandwichTable({
  sandwiches,
  referenceNow,
}: SandwichTableProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [pool, setPool] = useState("all");
  const [attacker, setAttacker] = useState("all");
  const [query, setQuery] = useState("");

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
    const header = [
      "Date",
      "Layer",
      "Venue",
      "Pair",
      "Loss USD",
      "Attacker",
      "Confidence",
      "Slot",
      "Signature",
    ];
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
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      )
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
      <header className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <p className="text-label">Detections · {filtered.length}</p>
      </header>

      <div className="flex flex-wrap gap-2 mb-4">
        <Select
          value={timeRange}
          onChange={(v) => setTimeRange(v as TimeRange)}
          options={TIME_RANGES.map((r) => ({ value: r.value, label: r.label }))}
        />
        <Select
          value={pool}
          onChange={setPool}
          options={[
            { value: "all", label: "All DEXes" },
            ...pools.map((p) => ({ value: p, label: p })),
          ]}
        />
        <Select
          value={attacker}
          onChange={setAttacker}
          options={[
            { value: "all", label: "All attackers" },
            ...attackers.map((a) => ({
              value: a,
              label: attackerDisplayName(a),
            })),
          ]}
        />
        <input
          type="search"
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search attacks"
          className="gt-input"
          style={{
            background: "var(--bg-overlay)",
            border: "1px solid var(--border-default)",
            borderRadius: 6,
            padding: "8px 12px",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--text-primary)",
            flex: 1,
            minWidth: 160,
          }}
        />
        <button
          type="button"
          onClick={exportCsv}
          className="gt-btn-secondary"
          style={{
            background: "var(--bg-overlay)",
            border: "1px solid var(--border-default)",
            borderRadius: 6,
            padding: "8px 14px",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--text-primary)",
            cursor: "pointer",
          }}
        >
          Export CSV
        </button>
      </div>

      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 8,
          overflow: "auto",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr
              style={{
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <Th>Date</Th>
              <Th>Layer</Th>
              <Th>Venue</Th>
              <Th>Pair</Th>
              <Th>Loss</Th>
              <Th>Attacker</Th>
              <Th>Confidence</Th>
              <Th>Tx</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  style={{
                    padding: 32,
                    textAlign: "center",
                    color: "var(--text-tertiary)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                  }}
                >
                  No matches
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr key={s.id} className="sw-row">
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
                  <Td>
                    <LossValue
                      value={s.lossUsd}
                      outputAmount={s.lossOutputAmount}
                      size="sm"
                    />
                  </Td>
                  <Td>
                    <AttackerAddress address={s.attacker} label={s.knownBotName} />
                  </Td>
                  <Td>{typeof s.confidence === "number" ? s.confidence.toFixed(2) : "--"}</Td>
                  <Td>
                    <a
                      href={`https://solscan.io/tx/${encodeURIComponent(s.txSignature)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--accent)" }}
                      aria-label="View transaction on Solscan"
                    >
                      <span aria-hidden>↗</span>
                    </a>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "12px 20px",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        fontWeight: 400,
        letterSpacing: 0,
        textTransform: "uppercase",
        color: "var(--text-secondary)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td
      style={{
        padding: "12px 20px",
        fontFamily: "var(--font-mono)",
        fontSize: 13,
        color: "var(--text-primary)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </td>
  );
}

interface SelectProps {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}

function Select({ value, onChange, options }: SelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="gt-input"
      style={{
        background: "var(--bg-overlay)",
        border: "1px solid var(--border-default)",
        borderRadius: 6,
        padding: "8px 28px 8px 12px",
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        color: "var(--text-primary)",
        cursor: "pointer",
        appearance: "none",
        WebkitAppearance: "none",
        backgroundImage:
          "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"6\" viewBox=\"0 0 10 6\"><path d=\"M1 1l4 4 4-4\" fill=\"none\" stroke=\"%23888\" stroke-width=\"1.5\"/></svg>')",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 10px center",
      }}
    >
      {options.map((o) => (
        <option
          key={o.value}
          value={o.value}
          style={{ background: "var(--bg-overlay)" }}
        >
          {o.label}
        </option>
      ))}
    </select>
  );
}
