import type { ThreatLevel } from "./types";
import { cn } from "./utils";

const labels: Record<ThreatLevel, string> = {
  high: "HIGH",
  medium: "MED",
  low: "LOW",
  none: "CLEAN",
};

const palette: Record<ThreatLevel, { color: string; bg: string }> = {
  high: { color: "var(--threat-red)", bg: "var(--threat-red-dim)" },
  medium: { color: "var(--threat-amber)", bg: "var(--threat-amber-dim)" },
  low: { color: "var(--safe-green)", bg: "var(--safe-green-dim)" },
  none: { color: "var(--text-secondary)", bg: "var(--bg-elevated)" },
};

export interface ThreatBadgeProps {
  level: ThreatLevel;
  label?: string;
  className?: string;
}

export function ThreatBadge({ level, label, className }: ThreatBadgeProps) {
  const { color, bg } = palette[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded text-label",
        className,
      )}
      style={{ color, background: bg, fontSize: 11, letterSpacing: "0.1em" }}
    >
      {level === "high" && (
        <span
          aria-hidden
          className="inline-block rounded-full"
          style={{
            width: 6,
            height: 6,
            background: "var(--threat-red)",
            animation: "threat-pulse 2s infinite",
          }}
        />
      )}
      {label ?? labels[level]}
    </span>
  );
}

export type { ThreatLevel };
