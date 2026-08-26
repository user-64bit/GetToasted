"use client";

import { MonoNumber } from "./mono-number";

/**
 * A loss is evidence, not a headline. It always renders in tabular mono so
 * columns align and the figure reads as an instrument readout. `size` only
 * scales it; it never switches to a display serif.
 */
export function LossValue({
  value,
  outputAmount,
  animated = false,
  size = "md",
}: {
  value: number | null | undefined;
  outputAmount?: string | null;
  animated?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const fontSize = size === "xl" ? 52 : size === "lg" ? 30 : size === "sm" ? 13 : 18;
  const fontWeight = size === "lg" || size === "xl" ? 500 : 500;
  const letterSpacing = size === "lg" || size === "xl" ? "-0.02em" : "0";

  if (typeof value === "number" && Number.isFinite(value)) {
    return (
      <span style={{ fontSize, lineHeight: 1, display: "inline-block" }}>
        <MonoNumber
          value={value}
          prefix="$"
          color="threat"
          animated={animated}
          fontFamily="var(--font-mono)"
          fontWeight={fontWeight}
          letterSpacing={letterSpacing}
        />
      </span>
    );
  }

  return (
    <span
      style={{
        display: "inline-flex",
        flexDirection: "column",
        gap: 2,
        fontFamily: "var(--font-mono)",
        color: "var(--threat-amber)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <span style={{ fontSize }}>unpriced</span>
      {outputAmount ? (
        <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
          {outputAmount} tokens
        </span>
      ) : null}
    </span>
  );
}
