import type { DetectionLayer } from "./types";

const copy: Record<string, { label: string; tone: "high" | "medium" | "low" }> = {
  L1: { label: "L1 Jito", tone: "high" },
  L2: { label: "L2 Adjacent", tone: "high" },
  L3: { label: "L3 Known bot", tone: "medium" },
  L4: { label: "L4 Suspected", tone: "medium" },
  L5: { label: "L5 Deferred", tone: "low" },
  legacy: { label: "Legacy", tone: "low" },
};

const palette = {
  high: {
    color: "var(--threat-red)",
    border: "var(--threat-red-border)",
    bg: "var(--threat-red-dim)",
  },
  medium: {
    color: "var(--threat-amber)",
    border: "var(--threat-amber-border)",
    bg: "var(--threat-amber-dim)",
  },
  low: {
    color: "var(--text-secondary)",
    border: "var(--border-default)",
    bg: "var(--bg-elevated)",
  },
} as const;

export function DetectionLayerBadge({ layer }: { layer?: DetectionLayer }) {
  const item = copy[layer ?? "legacy"] ?? {
    label: layer ?? "Unknown",
    tone: "low" as const,
  };
  const p = palette[item.tone];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        border: `1px solid ${p.border}`,
        background: p.bg,
        color: p.color,
        borderRadius: "var(--radius-chip)",
        padding: "3px 6px",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        textTransform: "uppercase",
      }}
    >
      {item.label}
    </span>
  );
}
