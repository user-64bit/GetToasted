"use client";

import { useEffect, useRef } from "react";
import { cn, easeOutQuint } from "./utils";

export type MonoNumberColor = "default" | "threat" | "safe" | "amber";

export interface MonoNumberProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  animated?: boolean;
  color?: MonoNumberColor;
  durationMs?: number;
  className?: string;
}

const colorFor: Record<MonoNumberColor, string> = {
  default: "var(--text-primary)",
  threat: "var(--threat-red)",
  safe: "var(--safe-green)",
  amber: "var(--threat-amber)",
};

function format(value: number, decimals: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function MonoNumber({
  value,
  prefix = "",
  suffix = "",
  decimals = 2,
  animated = false,
  color = "default",
  durationMs = 520,
  className,
}: MonoNumberProps) {
  const elRef = useRef<HTMLSpanElement | null>(null);
  // Holds the latest *numeric* value being shown — used as the from-point on prop change.
  const currentRef = useRef<number>(animated ? 0 : value);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    if (!animated) {
      currentRef.current = value;
      el.textContent = `${prefix}${format(value, decimals)}${suffix}`;
      return;
    }

    let raf = 0;
    let start: number | null = null;
    const from = currentRef.current;
    const to = value;

    const tick = (now: number) => {
      if (start === null) start = now;
      const t = Math.min((now - start) / durationMs, 1);
      const cur = from + (to - from) * easeOutQuint(t);
      currentRef.current = cur;
      if (elRef.current) {
        elRef.current.textContent = `${prefix}${format(cur, decimals)}${suffix}`;
      }
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, animated, durationMs, prefix, suffix, decimals]);

  // Initial server/first-render content — animated counters start at 0 and animate up post-mount.
  const initial = animated ? 0 : value;

  return (
    <span
      ref={elRef}
      className={cn(className)}
      style={{
        fontFamily: "var(--font-mono)",
        color: colorFor[color],
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {prefix}
      {format(initial, decimals)}
      {suffix}
    </span>
  );
}
