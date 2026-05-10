"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";

const C_LINE = "var(--chart-line)";
const C_GRID = "var(--chart-grid)";
const C_AXIS = "var(--text-tertiary)";
const C_DOT_BG = "var(--bg-void)";
const C_CURSOR = "var(--border-strong)";

interface LossesChartProps {
  data: { month: string; loss: number }[];
}

export function LossesChart({ data }: LossesChartProps) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 8,
        padding: 24,
      }}
    >
      <header className="flex items-baseline justify-between mb-6">
        <p className="text-label">Losses over time</p>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-tertiary)",
            letterSpacing: 0,
          }}
        >
          12 MONTHS
        </p>
      </header>
      <div style={{ width: "100%", height: 240 }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 10, right: 6, bottom: 0, left: -8 }}>
            <defs>
              <linearGradient id="loss-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C_LINE} stopOpacity={0.25} />
                <stop offset="100%" stopColor={C_LINE} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={C_GRID} vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontFamily: "var(--font-mono)", fontSize: 11, fill: C_AXIS }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontFamily: "var(--font-mono)", fontSize: 11, fill: C_AXIS }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${v}`}
              width={48}
            />
            <Tooltip cursor={{ stroke: C_CURSOR, strokeWidth: 1 }} content={CustomTooltip} />
            <Area
              type="monotone"
              dataKey="loss"
              stroke={C_LINE}
              strokeWidth={2}
              fill="url(#loss-fill)"
              activeDot={{ r: 4, stroke: C_LINE, fill: C_DOT_BG, strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function CustomTooltip(props: TooltipContentProps) {
  const { active, payload, label } = props;
  if (!active || !payload || payload.length === 0) return null;
  const value = payload[0]?.value;
  return (
    <div
      style={{
        background: "var(--bg-overlay)",
        border: "1px solid var(--border-default)",
        borderRadius: 4,
        padding: "8px 12px",
        fontFamily: "var(--font-mono)",
        fontSize: 12,
      }}
    >
      <p style={{ color: "var(--text-secondary)", marginBottom: 4 }}>{label}</p>
      <p style={{ color: "var(--threat-red)" }}>
        ${typeof value === "number" ? value.toFixed(2) : "0.00"}
      </p>
    </div>
  );
}
