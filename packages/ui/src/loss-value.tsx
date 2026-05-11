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
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const fontSize = size === "xl" ? 56 : size === "lg" ? 32 : size === "sm" ? 13 : 18;
  // Editorial register: emotionally weighted USD callouts use Fraunces. Tool
  // register (sm/md inside tables, cards) stays mono so tabular columns line
  // up. lg/xl are the "loss as a punch" sizes — landing sample scan + the
  // dashboard's hero number.
  const isDisplay = size === "lg" || size === "xl";
  const family = isDisplay
    ? "var(--font-display-family)"
    : "var(--font-mono)";
  const fontWeight = isDisplay ? 400 : 500;
  const letterSpacing = isDisplay ? "-0.02em" : "0";

  if (typeof value === "number" && Number.isFinite(value)) {
    return (
      <span style={{ fontSize, lineHeight: 1, display: "inline-block" }}>
        <MonoNumber
          value={value}
          prefix="$"
          color="threat"
          animated={animated}
          fontFamily={family}
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
      <span style={{ fontSize }}>USD unknown</span>
      {outputAmount ? (
        <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
          raw loss {outputAmount}
        </span>
      ) : null}
    </span>
  );
}
