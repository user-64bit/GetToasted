import { AttackerAddress } from "@get-toasted/ui/attacker-address";
import { DetectionLayerBadge } from "@get-toasted/ui/detection-layer-badge";
import { LossValue } from "@get-toasted/ui/loss-value";

const rows = [
  {
    layer: "L1",
    time: "slot 418,124,934",
    venue: "Raydium",
    pair: "SOL/USDC",
    lossUsd: 142.2,
    attacker: "ArscACTiveSandWichBoTpUbKey1111111111111111",
    attackerLabel: "arsc-active",
    confidence: "1.00",
  },
  {
    layer: "L2",
    time: "slot 418,119,402",
    venue: "Orca",
    pair: "BONK/SOL",
    lossUsd: 83.11,
    attacker: "B91piBSfCBRs5rUxCMRdJEGv7tNEnFxweWcdQJHJoFpi",
    attackerLabel: "B91",
    confidence: "0.95",
  },
  {
    layer: "L4",
    time: "slot 418,101,778",
    venue: "PumpSwap",
    pair: "LONGTAIL/SOL",
    lossUsd: 22.50,
    attacker: "3cxZai94fxXF5sQdLUhwUiVQioAxkdrQcFTJkwrsKNS8",
    attackerLabel: null,
    confidence: "0.65",
  },
] satisfies ReadonlyArray<{
  layer: string;
  time: string;
  venue: string;
  pair: string;
  lossUsd: number;
  attacker: string;
  attackerLabel: string | null;
  confidence: string;
}>;

export function SampleScan() {
  return (
    <aside
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-panel)",
        overflow: "hidden",
      }}
      aria-label="Sample forensic scan"
    >
      <header
        className="flex items-start justify-between gap-4"
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div>
          <p className="text-label">Sample wallet report</p>
          <p
            className="mt-1"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              color: "var(--text-tertiary)",
            }}
          >
            9973h...zWp6
          </p>
        </div>
        <div className="text-right">
          <p className="text-label">Total extracted</p>
          <div className="mt-1">
            <LossValue value={247.81} size="lg" />
          </div>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-px" style={{ background: "var(--border-subtle)" }}>
        <Metric label="Detections" value="3" tone="threat" />
        <Metric label="Top layer" value="L1" />
        <Metric label="Window" value="30d" />
      </div>

      <div style={{ padding: 16 }}>
        <p className="text-label" style={{ marginBottom: 10 }}>
          Detection stream
        </p>
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <article
              key={`${row.layer}-${row.time}`}
              style={{
                border: "1px solid var(--border-subtle)",
                borderLeft: `2px solid ${
                  row.layer === "L4" ? "var(--threat-amber)" : "var(--threat-red)"
                }`,
                borderRadius: "var(--radius-chip)",
                padding: 12,
                background: "var(--bg-elevated)",
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <DetectionLayerBadge layer={row.layer} />
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--text-tertiary)",
                  }}
                >
                  {row.time} / confidence {row.confidence}
                </span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                <div>
                  <p
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 13,
                      color: "var(--text-primary)",
                    }}
                  >
                    {row.venue} / {row.pair}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-label">Attacker</span>
                    <AttackerAddress address={row.attacker} label={row.attackerLabel} />
                  </div>
                </div>
                <LossValue value={row.lossUsd} size="sm" />
              </div>
            </article>
          ))}
        </div>
      </div>
    </aside>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "threat" | "amber";
}) {
  return (
    <div style={{ background: "var(--bg-base)", padding: "12px 14px" }}>
      <p className="text-label" style={{ fontSize: 9 }}>
        {label}
      </p>
      <p
        className="mt-1"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 22,
          color:
            tone === "threat"
              ? "var(--threat-red)"
              : tone === "amber"
                ? "var(--threat-amber)"
                : "var(--text-primary)",
        }}
      >
        {value}
      </p>
    </div>
  );
}
