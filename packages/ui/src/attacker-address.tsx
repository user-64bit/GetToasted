"use client";

import { useState } from "react";
import { lookupBotName } from "./bots";
import { cn, truncateAddress } from "./utils";

export interface AttackerAddressProps {
  address: string;
  label?: string | null;
  className?: string;
}

export function AttackerAddress({ address, label, className }: AttackerAddressProps) {
  const [copied, setCopied] = useState(false);
  const botName = lookupBotName(address);
  const display = label ?? botName ?? truncateAddress(address);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 700);
    } catch {
      // clipboard blocked — silently no-op
    }
  };

  const baseColor = label || botName ? "var(--threat-red)" : "var(--text-primary)";

  return (
    <button
      type="button"
      onClick={onCopy}
      title={copied ? "Copied" : `Click to copy ${address}`}
      className={cn("cursor-pointer transition-colors", className)}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 13,
        color: copied ? "var(--safe-green)" : baseColor,
      }}
    >
      {copied ? "COPIED" : display}
    </button>
  );
}
