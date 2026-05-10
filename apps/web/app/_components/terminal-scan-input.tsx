"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

export function TerminalScanInput() {
  const router = useRouter();
  const { publicKey, connected } = useWallet();
  const [manualValue, setManualValue] = useState<string | null>(null);

  const value =
    manualValue ?? (connected && publicKey ? publicKey.toBase58() : "");

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    router.push(`/dashboard?wallet=${encodeURIComponent(trimmed)}`);
  };

  return (
    <form
      onSubmit={onSubmit}
      className="terminal-input flex items-center w-full"
      style={{ paddingLeft: 16, paddingRight: 6, paddingTop: 6, paddingBottom: 6 }}
    >
      <span
        aria-hidden
        style={{
          fontFamily: "var(--font-mono)",
          color: "var(--safe-green)",
          fontSize: 16,
          marginRight: 12,
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
          fontSize: 15,
          background: "transparent",
          color: "var(--text-primary)",
          padding: "10px 0",
        }}
        aria-label="Solana wallet address"
      />
      {value.length === 0 && (
        <span
          aria-hidden
          className="hidden sm:inline"
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--safe-green)",
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
        disabled={value.trim().length === 0}
        className="gt-btn"
        style={{
          background: "var(--threat-red)",
          color: "var(--text-inverse)",
          padding: "10px 18px",
          borderRadius: 4,
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: 0,
        }}
      >
        SCAN
      </button>
    </form>
  );
}
