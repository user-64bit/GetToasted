import type { DetectionLayer } from "./types";

const copy: Record<string, { label: string; tone: "threat" | "amber" | "muted" }> = {
  L1: { label: "L1 · Jito bundle", tone: "threat" },
  L2: { label: "L2 · Adjacent", tone: "threat" },
  L3: { label: "L3 · Known bot", tone: "amber" },
  L4: { label: "L4 · Suspected", tone: "amber" },
  L5: { label: "L5 · Deferred", tone: "muted" },
  legacy: { label: "Legacy", tone: "muted" },
};

export function DetectionLayerBadge({ layer }: { layer?: DetectionLayer }) {
  const item = copy[layer ?? "legacy"] ?? {
    label: layer ?? "Unknown",
    tone: "muted" as const,
  };
  const cls =
    item.tone === "threat"
      ? "chip chip-threat"
      : item.tone === "amber"
        ? "chip chip-amber"
        : "chip";

  return <span className={cls}>{item.label}</span>;
}
