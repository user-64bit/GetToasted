import { AttackerAddress } from "./attacker-address";
import { DetectionLayerBadge } from "./detection-layer-badge";
import { LossValue } from "./loss-value";
import type { Sandwich } from "./types";

/**
 * BracketTrace — the signature component.
 *
 * A sandwich is three transactions in one slot: the bot buys ahead of you
 * (front-run), your swap fills at the moved price (victim), the bot sells
 * behind you (back-run). This reconstructs that bracket so the attack is
 * legible and every leg is verifiable on-chain. Nothing here is decorative —
 * the bracket rail *is* the sandwich.
 */

function solscanTx(sig: string): string {
  return `https://solscan.io/tx/${encodeURIComponent(sig)}`;
}

function TxLink({ sig }: { sig?: string }) {
  if (!sig) {
    return (
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
        —
      </span>
    );
  }
  return (
    <a
      href={solscanTx(sig)}
      target="_blank"
      rel="noopener noreferrer"
      className="nav-link"
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        color: "var(--text-tertiary)",
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
      }}
      aria-label="View transaction on Solscan"
    >
      {sig.slice(0, 4)}…{sig.slice(-4)} <span aria-hidden>↗</span>
    </a>
  );
}

function Leg({
  tag,
  tagColor,
  title,
  detail,
  sig,
  highlight,
}: {
  tag: string;
  tagColor: string;
  title: React.ReactNode;
  detail?: React.ReactNode;
  sig?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-3"
      style={{
        padding: "10px 12px",
        background: highlight ? "var(--bg-elevated)" : "transparent",
        borderRadius: highlight ? "var(--radius-control)" : 0,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: tagColor,
          width: 58,
          flexShrink: 0,
        }}
      >
        {tag}
      </span>
      <div className="min-w-0 flex-1">
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            color: "var(--text-primary)",
            lineHeight: 1.35,
          }}
        >
          {title}
        </div>
        {detail ? (
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>
            {detail}
          </div>
        ) : null}
      </div>
      <TxLink sig={sig} />
    </div>
  );
}

export function BracketTrace({
  sandwich,
  className,
}: {
  sandwich: Sandwich;
  className?: string;
}) {
  const suspected =
    sandwich.detectionLayer === "L4" ||
    sandwich.detectionLayer === "L5" ||
    (typeof sandwich.confidence === "number" && sandwich.confidence < 0.8);
  const railColor = suspected ? "var(--threat-amber)" : "var(--threat-red)";
  const venue = sandwich.dex ?? sandwich.pool;

  return (
    <div className={`panel ${className ?? ""}`} style={{ overflow: "hidden" }}>
      {/* Meta strip */}
      <div
        className="panel-hd"
        style={{ flexWrap: "wrap", gap: 10, rowGap: 6 }}
      >
        <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
          <DetectionLayerBadge layer={sandwich.detectionLayer} />
          {sandwich.jitoBundled && sandwich.detectionLayer !== "L1" ? (
            <DetectionLayerBadge layer="L1" />
          ) : null}
          {sandwich.failed ? <span className="chip chip-amber">back-run reverted</span> : null}
        </div>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-tertiary)",
            letterSpacing: "0.02em",
          }}
        >
          slot {sandwich.slot.toLocaleString("en-US")} · {venue}
        </span>
      </div>

      {/* The bracket */}
      <div style={{ padding: 14 }}>
        <div style={{ position: "relative", paddingLeft: 20 }}>
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: 0,
              top: 8,
              bottom: 8,
              width: 9,
              borderLeft: `2px solid ${railColor}`,
              borderTop: `2px solid ${railColor}`,
              borderBottom: `2px solid ${railColor}`,
              borderRadius: "3px 0 0 3px",
              opacity: 0.9,
            }}
          />
          <Leg
            tag="Front"
            tagColor={railColor}
            title={
              <>
                Bot bought ahead of you
              </>
            }
            detail={
              <span className="inline-flex items-center gap-1.5">
                <AttackerAddress address={sandwich.attacker} label={sandwich.knownBotName} />
                <span style={{ color: "var(--text-muted)" }}>pushed the price up</span>
              </span>
            }
            sig={sandwich.frontSig}
          />
          <Leg
            tag="You"
            tagColor="var(--accent)"
            title={<>Your swap · {sandwich.pair}</>}
            detail="filled at the worse price"
            sig={sandwich.txSignature}
            highlight
          />
          <Leg
            tag="Back"
            tagColor={railColor}
            title={
              sandwich.failed ? "Bot's back-run reverted" : "Bot sold behind you"
            }
            detail={
              sandwich.failed
                ? "you still paid the front-run slippage"
                : "banked the difference"
            }
            sig={sandwich.backSig}
          />
        </div>
      </div>

      {/* Verdict footer */}
      <div
        className="flex items-end justify-between gap-4"
        style={{
          padding: "13px 16px",
          borderTop: "1px solid var(--border-subtle)",
          background: "var(--bg-base)",
        }}
      >
        <div className="min-w-0">
          <p className="text-label" style={{ marginBottom: 6 }}>
            Extracted from you
          </p>
          <LossValue value={sandwich.lossUsd} outputAmount={sandwich.lossOutputAmount} size="lg" />
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {sandwich.lossMethod ? (
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--text-tertiary)",
                marginBottom: 4,
              }}
            >
              {lossMethodLabel(sandwich.lossMethod)}
            </p>
          ) : null}
          {typeof sandwich.confidence === "number" ? (
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--text-secondary)",
              }}
            >
              confidence {sandwich.confidence.toFixed(2)}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function lossMethodLabel(method: string): string {
  switch (method) {
    case "cpmm-reconstruction":
      return "exact · pool math";
    case "backrun-profit-proxy":
      return "estimate · bot profit";
    case "failed-backrun-slippage":
      return "estimate · slippage";
    default:
      return method;
  }
}
