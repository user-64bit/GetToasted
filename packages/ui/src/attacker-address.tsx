"use client";

import { useState } from "react";
import { lookupBotName } from "./bots";
import { cn, truncateAddress } from "./utils";

export interface AttackerAddressProps {
  address: string;
  className?: string;
}

export function AttackerAddress({ address, className }: AttackerAddressProps) {
  const [copied, setCopied] = useState(false);
  const botName = lookupBotName(address);
  const display = botName ?? truncateAddress(address);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 700);
    } catch {
      // clipboard blocked — silently no-op
    }
  };

  const baseColor = botName ? "var(--threat-red)" : "var(--text-primary)";

  return (
    <button
      type="button"
      onClick={onCopy}
      title={copied ? "Copied" : `Click to copy ${address}`}
      className={cn("cursor-pointer transition-colors", className)}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 14,
        color: copied ? "var(--safe-green)" : baseColor,
      }}
    >
      {copied ? "COPIED" : display}
    </button>
  );
}
