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

export function SandwichCard({
  sandwich,
  isNew = false,
  className,
}: SandwichCardProps) {
  const [showNewBadge, setShowNewBadge] = useState(isNew);

  useEffect(() => {
    if (!isNew) return;
    const t = window.setTimeout(() => setShowNewBadge(false), 3000);
    return () => window.clearTimeout(t);
  }, [isNew]);

  const date = new Date(sandwich.detectedAt);
  const dateStr = dateFormatter.format(date);

  return (
    <article
      className={cn(
        "relative overflow-hidden",
        isNew && "gt-card-flash gt-slide-in-right",
        className,
      )}
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-panel)",
        padding: 16,
      }}
    >
      {showNewBadge && (
        <span
          className="absolute inline-flex items-center gap-1.5 gt-badge-fade"
          style={{
            top: 16,
            right: 20,
            color: "var(--threat-red)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: 0,
            textTransform: "uppercase",
          }}
        >
          NEW
          <span
            aria-hidden
            className="inline-block rounded-full"
            style={{
              width: 6,
              height: 6,
              background: "var(--threat-red)",
              animation: "threat-pulse 2s infinite",
            }}
          />
        </span>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <DetectionLayerBadge layer={sandwich.detectionLayer} />
        {sandwich.jitoBundled && sandwich.detectionLayer !== "L1" ? (
          <DetectionLayerBadge layer="L1" />
        ) : null}
        {sandwich.failed ? (
          <span
            style={{
              border: "1px solid var(--threat-amber-border)",
              background: "var(--threat-amber-dim)",
              color: "var(--threat-amber)",
              borderRadius: "var(--radius-chip)",
              padding: "3px 6px",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              textTransform: "uppercase",
            }}
          >
            failed backrun
          </span>
        ) : null}
      </div>

      <div
        className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        <div>
          <p
            style={{
              color: "var(--text-secondary)",
              fontSize: 12,
              marginBottom: 6,
            }}
          >
            {dateStr} / {sandwich.pool} / {sandwich.pair}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>
              Attacker
            </span>
            <AttackerAddress
              address={sandwich.attacker}
              label={sandwich.knownBotName}
            />
            <span style={{ color: "var(--text-tertiary)" }}>/</span>
            <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>
              Slot
            </span>
            <span style={{ fontSize: 13 }}>
              {sandwich.slot.toLocaleString("en-US")}
            </span>
          </div>
        </div>
        <div className="md:text-right">
          <p className="text-label" style={{ marginBottom: 4 }}>
            Extracted
          </p>
          <LossValue
            value={sandwich.lossUsd}
            outputAmount={sandwich.lossOutputAmount}
            animated
          />
        </div>
      </div>
    </article>
  );
}
