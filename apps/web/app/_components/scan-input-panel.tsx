import type { ReactNode } from "react";
import { TerminalScanInput } from "./terminal-scan-input";

interface ScanInputPanelProps {
  label?: string;
  title?: ReactNode;
  helper?: ReactNode;
  ctaLabel?: string;
  /** Compact variant: just the input, no framed header. */
  compact?: boolean;
}

export function ScanInputPanel({
  label = "Scan a wallet",
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
          <p className="field-hint" style={{ marginTop: 10 }}>
            {helper}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <section className="scan-input-panel" style={{ padding: 22 }} aria-label="Begin forensic scan">
      <header className="flex items-center gap-2.5" style={{ marginBottom: 16 }}>
        <span aria-hidden style={{ width: 24, height: 1, background: "var(--accent)" }} />
        <span className="text-kicker" style={{ margin: 0 }}>
          {label}
        </span>
      </header>

      {title ? (
        <h3 className="text-h2" style={{ marginBottom: 8, color: "var(--text-primary)" }}>
          {title}
        </h3>
      ) : null}
      {helper ? (
        <p className="text-body-sm" style={{ marginBottom: 18, maxWidth: 460 }}>
          {helper}
        </p>
      ) : null}

      <TerminalScanInput ctaLabel={ctaLabel} />

      <div className="flex items-center gap-2" style={{ marginTop: 14 }}>
        <span className="dot" style={{ background: "var(--safe-green)", width: 6, height: 6 }} />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            color: "var(--text-tertiary)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          Read-only · no signature required
        </span>
      </div>
    </section>
  );
}
