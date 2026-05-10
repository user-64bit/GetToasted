"use client";

import { MonoNumber } from "./mono-number";

export function LossValue({
  value,
  outputAmount,
  animated = false,
  size = "md",
}: {
  value: number | null | undefined;
  outputAmount?: string | null;
  animated?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const fontSize = size === "lg" ? 32 : size === "sm" ? 13 : 18;

  if (typeof value === "number" && Number.isFinite(value)) {
    return (
      <span style={{ fontSize, fontFamily: "var(--font-mono)" }}>
        <MonoNumber value={value} prefix="$" color="threat" animated={animated} />
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
      <span style={{ fontSize }}>USD unknown</span>
      {outputAmount ? (
        <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
          raw loss {outputAmount}
        </span>
      ) : null}
    </span>
  );
}
