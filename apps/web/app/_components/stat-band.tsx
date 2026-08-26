import type { ReactNode } from "react";

export interface StatCellData {
  label: string;
  value: ReactNode;
  source?: string;
  tone?: "default" | "threat" | "amber" | "accent";
}

interface StatBandProps {
  cells: StatCellData[];
  className?: string;
}

function toneColor(tone?: StatCellData["tone"]): string {
  if (tone === "threat") return "var(--threat-red)";
  if (tone === "amber") return "var(--threat-amber)";
  if (tone === "accent") return "var(--accent)";
  return "var(--text-primary)";
}

/**
 * Stat band — four readout cells in a hairline grid. The cell *value* is
 * rendered exactly as the caller passes it; this component only paints the
 * frame, label and source line. Values should use the tabular mono readout.
 */
export function StatBand({ cells, className }: StatBandProps) {
  return (
    <div className={`stat-band ${className ?? ""}`}>
      <div className="stat-band-inner">
        <div className="stat-grid">
          {cells.map((c, i) => (
            <div className="stat-cell" key={`${c.label}-${i}`}>
              <div
                style={{
                  color: toneColor(c.tone),
                  marginBottom: 16,
                  minHeight: 56,
                  display: "flex",
                  alignItems: "flex-end",
                }}
              >
                {c.value}
              </div>
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: "var(--text-secondary)",
                  lineHeight: 1.4,
                }}
              >
                {c.label}
              </p>
              {c.source ? (
                <p
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--text-tertiary)",
                    marginTop: 6,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  {c.source}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
