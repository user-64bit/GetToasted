"use client";

import { useEffect, useState } from "react";
import { cn } from "./utils";

export interface RiskMeterProps {
  /** 0..1 */
  score: number;
  label?: string;
  showPercent?: boolean;
  className?: string;
}

export function RiskMeter({
  score,
  label,
  showPercent = true,
  className,
}: RiskMeterProps) {
  const clamped = Math.max(0, Math.min(1, score));
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setAnimated(clamped));
    return () => window.cancelAnimationFrame(id);
  }, [clamped]);

  return (
    <div className={cn("w-full", className)}>
      {(label || showPercent) && (
        <div className="flex items-center justify-between mb-1.5">
          {label ? <span className="text-label">{label}</span> : <span />}
          {showPercent && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--text-primary)",
              }}
            >
              {(clamped * 100).toFixed(0)}%
            </span>
          )}
        </div>
      )}
      <div
        className="relative rounded-full overflow-hidden"
        style={{ height: 6, background: "var(--bg-elevated)" }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${animated * 100}%`,
            background:
              "linear-gradient(90deg, var(--safe-green) 0%, var(--threat-amber) 55%, var(--threat-red) 100%)",
            transition: "width 700ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
      </div>
    </div>
  );
}
