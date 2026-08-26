import { BracketTrace } from "@get-toasted/ui/bracket-trace";
import { DetectionLayerBadge } from "@get-toasted/ui/detection-layer-badge";
import { LossValue } from "@get-toasted/ui/loss-value";
import type { Sandwich } from "@get-toasted/ui/types";

/**
 * A real-shaped forensic verdict, rendered with the exact production
 * primitives — this is the product, not an illustration of it.
 */
const featured: Sandwich = {
  id: "sample-1",
  detectedAt: "2025-08-14T09:41:00Z",
  pool: "Raydium",
  dex: "Raydium",
  pair: "SOL/USDC",
  lossUsd: 142.2,
  detectionLayer: "L1",
  lossMethod: "cpmm-reconstruction",
  confidence: 1.0,
  jitoBundled: true,
  attacker: "Ai4zqY7gjyAPhtUsGnCfabM5oHcZLt3htjpSoUKvxkkt",
  knownBotName: "arsc-active",
  slot: 418124934,
  frontSig: "3nFrontRunSampleSig111111111111111111111111",
  txSignature: "5vVictimSwapSampleSig2222222222222222222222",
  backSig: "2xBackRunSampleSig33333333333333333333333333",
};

const others: Sandwich[] = [
  {
    id: "sample-2",
    detectedAt: "2025-08-11T18:02:00Z",
    pool: "Orca",
    dex: "Orca",
    pair: "BONK/SOL",
    lossUsd: 83.11,
    detectionLayer: "L2",
    confidence: 0.95,
    attacker: "B91piBSfCBRs5rUxCMRdJEGv7tNEnFxweWcdQJHJoFpi",
    knownBotName: "B91",
    slot: 418119402,
    txSignature: "4kVictimTwoSampleSig444444444444444444444444",
  },
  {
    id: "sample-3",
    detectedAt: "2025-08-09T02:29:00Z",
    pool: "PumpSwap",
    dex: "PumpSwap",
    pair: "LONGTAIL/SOL",
    lossUsd: 22.5,
    detectionLayer: "L4",
    confidence: 0.65,
    attacker: "3cxZai94fxXF5sQdLUhwUiVQioAxkdrQcFTJkwrsKNS8",
    knownBotName: null,
    slot: 418101778,
    txSignature: "6mVictimThreeSampleSig55555555555555555555555",
  },
];

export function SampleScan() {
  return (
    <div className="panel" style={{ overflow: "hidden" }} aria-label="Sample forensic scan">
      <div className="panel-hd" style={{ flexWrap: "wrap", gap: 12 }}>
        <div className="flex items-center gap-2.5">
          <span className="dot dot-threat" />
          <span className="text-label" style={{ color: "var(--text-secondary)" }}>
            Report · wallet 9973h…zWp6
          </span>
        </div>
        <span className="chip chip-threat">Toasted · 3 attacks</span>
      </div>

      <div className="grid grid-cols-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <SummaryCell label="Total extracted">
          <LossValue value={247.81} size="md" />
        </SummaryCell>
        <SummaryCell label="Confirmed / suspected">
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 18, color: "var(--text-primary)" }}>
            2 / 1
          </span>
        </SummaryCell>
        <SummaryCell label="Worst actor" last>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 18, color: "var(--threat-red)" }}>
            arsc-active
          </span>
        </SummaryCell>
      </div>

      <div style={{ padding: 16 }}>
        <p className="text-label" style={{ marginBottom: 12 }}>
          Worst attack · reconstructed
        </p>
        <BracketTrace sandwich={featured} />

        <p className="text-label" style={{ margin: "20px 0 10px" }}>
          Two more brackets
        </p>
        <div
          className="panel"
          style={{ overflow: "hidden", background: "var(--bg-base)" }}
        >
          {others.map((s) => (
            <div
              key={s.id}
              className="sw-row flex items-center gap-3"
              style={{ padding: "11px 14px" }}
            >
              <DetectionLayerBadge layer={s.detectionLayer} />
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  color: "var(--text-primary)",
                }}
              >
                {s.dex} · {s.pair}
              </span>
              <span className="ml-auto">
                <LossValue value={s.lossUsd} size="sm" />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SummaryCell({
  label,
  children,
  last,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      style={{
        padding: "16px 18px",
        borderRight: last ? "none" : "1px solid var(--border-subtle)",
      }}
    >
      <p className="text-label" style={{ marginBottom: 8, fontSize: 9.5 }}>
        {label}
      </p>
      {children}
    </div>
  );
}
