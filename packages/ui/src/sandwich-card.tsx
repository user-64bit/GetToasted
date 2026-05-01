"use client";

import { useEffect, useState } from "react";
import { AttackerAddress } from "./attacker-address";
import { MonoNumber } from "./mono-number";
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
        "relative rounded-lg overflow-hidden",
        isNew && "gt-card-flash gt-slide-in-right",
        className,
      )}
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        padding: "16px 20px",
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
            letterSpacing: "0.15em",
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

      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "var(--text-secondary)",
        }}
      >
        {dateStr} · {sandwich.pool} · {sandwich.pair}
      </div>

      <div
        className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1"
        style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}
      >
        <span style={{ color: "var(--text-secondary)" }}>Loss:</span>
        <MonoNumber
          value={sandwich.lossUsd}
          prefix="$"
          color="threat"
          animated
        />
        <span style={{ color: "var(--text-tertiary)" }}>·</span>
        <span style={{ color: "var(--text-secondary)" }}>Attacker:</span>
        <AttackerAddress address={sandwich.attacker} />
        <span style={{ color: "var(--text-tertiary)" }}>·</span>
        <span style={{ color: "var(--text-secondary)" }}>Slot:</span>
        <span>{sandwich.slot.toLocaleString("en-US")}</span>
      </div>
    </article>
  );
}
