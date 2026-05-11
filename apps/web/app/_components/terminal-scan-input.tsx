"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

interface TerminalScanInputProps {
  ctaLabel?: string;
}

export function TerminalScanInput({ ctaLabel = "Scan →" }: TerminalScanInputProps) {
  const router = useRouter();
  const { publicKey, connected } = useWallet();
  const [manualValue, setManualValue] = useState<string | null>(null);

  const value =
    manualValue ?? (connected && publicKey ? publicKey.toBase58() : "");
  const empty = value.trim().length === 0;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    router.push(`/dashboard?wallet=${encodeURIComponent(trimmed)}`);
  };

  return (
    <form
      onSubmit={onSubmit}
      className="scan-input-panel-frame w-full"
      style={{ paddingLeft: 14, paddingRight: 6, paddingTop: 6, paddingBottom: 6 }}
    >
      <span
        aria-hidden
        style={{
          fontFamily: "var(--font-mono)",
          color: "var(--accent)",
          fontSize: 14,
          marginRight: 12,
          letterSpacing: 0,
        }}
      >
        {">"}
      </span>
      <input
        value={value}
        onChange={(e) => setManualValue(e.target.value)}
        placeholder="Paste wallet address or connect"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        className="flex-1 min-w-0"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 14,
          background: "transparent",
          color: "var(--text-primary)",
          padding: "12px 0",
          letterSpacing: 0,
        }}
        aria-label="Solana wallet address"
      />
      {empty && (
        <span
          aria-hidden
          className="hidden sm:inline"
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--accent)",
            fontSize: 14,
            marginRight: 12,
            animation: "terminal-blink 1.1s steps(2, start) infinite",
          }}
        >
          ▍
        </span>
      )}
      <button
        type="submit"
        disabled={empty}
        className="gt-btn"
        style={{
          background: "var(--accent)",
          color: "var(--text-inverse)",
          padding: "11px 18px",
          borderRadius: 2,
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {ctaLabel}
      </button>
    </form>
  );
}
