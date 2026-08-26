"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

interface TerminalScanInputProps {
  ctaLabel?: string;
}

export function TerminalScanInput({ ctaLabel = "Run scan" }: TerminalScanInputProps) {
  const router = useRouter();
  const { publicKey, connected } = useWallet();
  const [manualValue, setManualValue] = useState<string | null>(null);

  const value = manualValue ?? (connected && publicKey ? publicKey.toBase58() : "");
  const empty = value.trim().length === 0;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    router.push(`/dashboard?wallet=${encodeURIComponent(trimmed)}`);
  };

  return (
    <form onSubmit={onSubmit} className="scan-input-panel-frame w-full" style={{ padding: "5px 5px 5px 13px" }}>
      <span
        aria-hidden
        style={{ fontFamily: "var(--font-mono)", color: "var(--accent)", fontSize: 14, marginRight: 10 }}
      >
        {">"}
      </span>
      <input
        value={value}
        onChange={(e) => setManualValue(e.target.value)}
        placeholder="Paste a Solana address, or connect"
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
          padding: "11px 0",
        }}
        aria-label="Solana wallet address"
      />
      <button type="submit" disabled={empty} className="btn btn-accent">
        {ctaLabel}
        <span aria-hidden>→</span>
      </button>
    </form>
  );
}
