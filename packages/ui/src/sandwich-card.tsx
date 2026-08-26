"use client";

import { useEffect, useState } from "react";
import { AttackerAddress } from "./attacker-address";
import { DetectionLayerBadge } from "./detection-layer-badge";
import { LossValue } from "./loss-value";
import type { Sandwich } from "./types";
import { cn } from "./utils";

export interface SandwichCardProps {
  sandwich: Sandwich;
  isNew?: boolean;
  className?: string;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function SandwichCard({ sandwich, isNew = false, className }: SandwichCardProps) {
  const [showNewBadge, setShowNewBadge] = useState(isNew);

  useEffect(() => {
    if (!isNew) return;
    const t = window.setTimeout(() => setShowNewBadge(false), 3000);
    return () => window.clearTimeout(t);
  }, [isNew]);

  const dateStr = dateFormatter.format(new Date(sandwich.detectedAt));

  return (
    <article
      className={cn("panel relative", isNew && "gt-card-flash gt-slide-in-right", className)}
      style={{ padding: 15 }}
    >
      {showNewBadge && (
        <span
          className="absolute inline-flex items-center gap-1.5 gt-badge-fade"
          style={{
            top: 14,
            right: 16,
            color: "var(--threat-red)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          new
          <span className="dot dot-threat" style={{ width: 6, height: 6 }} />
        </span>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <DetectionLayerBadge layer={sandwich.detectionLayer} />
        {sandwich.jitoBundled && sandwich.detectionLayer !== "L1" ? (
          <DetectionLayerBadge layer="L1" />
        ) : null}
        {sandwich.failed ? <span className="chip chip-amber">back-run reverted</span> : null}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]" style={{ fontFamily: "var(--font-mono)" }}>
        <div className="min-w-0">
          <p style={{ color: "var(--text-secondary)", fontSize: 12, marginBottom: 6 }}>
            {dateStr} · {sandwich.pool} · {sandwich.pair}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1" style={{ fontSize: 12 }}>
            <span style={{ color: "var(--text-tertiary)" }}>attacker</span>
            <AttackerAddress address={sandwich.attacker} label={sandwich.knownBotName} />
            <span style={{ color: "var(--text-muted)" }}>·</span>
            <span style={{ color: "var(--text-tertiary)" }}>slot</span>
            <span className="tnum" style={{ color: "var(--text-secondary)" }}>
              {sandwich.slot.toLocaleString("en-US")}
            </span>
          </div>
        </div>
        <div className="md:text-right">
          <p className="text-label" style={{ marginBottom: 4 }}>
            Extracted
          </p>
          <LossValue value={sandwich.lossUsd} outputAmount={sandwich.lossOutputAmount} animated />
        </div>
      </div>
    </article>
  );
}
