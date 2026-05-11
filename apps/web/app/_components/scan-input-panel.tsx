import type { ReactNode } from "react";
import { TerminalScanInput } from "./terminal-scan-input";

interface ScanInputPanelProps {
  num?: string;
  label?: string;
  title?: ReactNode;
  helper?: ReactNode;
  ctaLabel?: string;
  /** Compact variant for inline use without the framed kicker block. */
  compact?: boolean;
}

export function ScanInputPanel({
  num,
  label = "BEGIN SCAN",
  title,
  helper,
  ctaLabel,
  compact = false,
}: ScanInputPanelProps) {
  if (compact) {
    return (
      <div className="w-full">
        <TerminalScanInput ctaLabel={ctaLabel} />
        {helper ? (
          <p
            className="mt-3"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--text-tertiary)",
              letterSpacing: 0.05,
            }}
          >
            {helper}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <section
      className="scan-input-panel"
      style={{ padding: 24 }}
      aria-label="Begin forensic scan"
    >
      <header
        className="flex items-center gap-3"
        style={{ marginBottom: 18 }}
      >
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: 36,
            height: 1,
            background: "var(--accent)",
          }}
        />
        <span className="text-kicker" style={{ marginBottom: 0 }}>
          {num ? <>§ {num} / </> : null}
          {label}
        </span>
      </header>

      {title ? (
        <h3
          className="text-h2"
          style={{ marginBottom: 8, color: "var(--text-primary)" }}
        >
          {title}
        </h3>
      ) : null}
      {helper ? (
        <p
          className="text-body-sm"
          style={{ marginBottom: 18, maxWidth: 480 }}
        >
          {helper}
        </p>
      ) : null}

      <TerminalScanInput ctaLabel={ctaLabel} />

      <p
        className="mt-4"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-tertiary)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        Read-only / no transaction signed
      </p>
    </section>
  );
}
