"use client";

import type { Sandwich } from "@get-toasted/ui/types";
import { useMemo } from "react";
import { attackerDisplayName } from "./view-model";

interface LossBreakdownProps {
  sandwiches: Sandwich[];
}

interface Row {
  key: string;
  name: string;
  loss: number;
  count: number;
  priced: boolean;
}

/**
 * "Who took the most from you." The product's core question, answered as a
 * ranked breakdown by attacker — not a smoothed area chart padded out to
 * look like a trend. Bars are proportional to priced USD; unpriced attacks
 * are counted honestly.
 */
export function LossBreakdown({ sandwiches }: LossBreakdownProps) {
  const rows = useMemo(() => aggregate(sandwiches), [sandwiches]);
  const hasPriced = rows.some((r) => r.priced);
  const max = Math.max(1, ...rows.map((r) => (hasPriced ? r.loss : r.count)));

  return (
    <div className="panel" style={{ overflow: "hidden" }}>
      <div className="panel-hd">
        <p className="text-label">Where it went · by attacker</p>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-tertiary)" }}>
          {rows.length} {rows.length === 1 ? "actor" : "actors"}
        </p>
      </div>

      <div className="panel-bd flex flex-col gap-3.5">
        {rows.map((r) => {
          const metric = hasPriced ? r.loss : r.count;
          const pct = Math.max(2, (metric / max) * 100);
          return (
            <div key={r.key}>
              <div className="flex items-baseline justify-between gap-3" style={{ marginBottom: 6 }}>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 13,
                    color: r.name === "unknown actor" ? "var(--text-secondary)" : "var(--threat-red)",
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.name}
                </span>
                <span
                  className="tnum"
                  style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-primary)", flexShrink: 0 }}
                >
                  {r.priced ? `$${r.loss.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "unpriced"}
                  <span style={{ color: "var(--text-tertiary)", marginLeft: 8 }}>
                    ·{r.count}
                  </span>
                </span>
              </div>
              <div
                style={{
                  height: 6,
                  background: "var(--bg-field)",
                  borderRadius: 999,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${pct}%`,
                    background: r.priced ? "var(--threat-red)" : "var(--border-strong)",
                    borderRadius: 999,
                    transition: "width var(--duration-slow) var(--ease-out)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function aggregate(sandwiches: Sandwich[]): Row[] {
  const map = new Map<string, Row>();
  for (const s of sandwiches) {
    const name = s.knownBotName ?? attackerDisplayName(s.attacker);
    const existing = map.get(s.attacker);
    const loss = s.lossUsd ?? 0;
    if (existing) {
      existing.loss += loss;
      existing.count += 1;
      existing.priced = existing.priced || s.lossUsd !== null;
    } else {
      map.set(s.attacker, {
        key: s.attacker,
        name,
        loss,
        count: 1,
        priced: s.lossUsd !== null,
      });
    }
  }
  return [...map.values()]
    .sort((a, b) => b.loss - a.loss || b.count - a.count)
    .slice(0, 6);
}
