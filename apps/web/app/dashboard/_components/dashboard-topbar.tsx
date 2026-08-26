"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { getApiUrl } from "../../lib/api-url";
import { HeaderNavLink, HeaderShell } from "../../_components/header";

export function DashboardTopbar({
  wallet,
  tone = "brand",
}: {
  wallet: string;
  tone?: "brand" | "threat";
}) {
  const truncated =
    wallet.length > 10 ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : wallet;

  return (
    <HeaderShell tone={tone}>
      <span
        className="hidden sm:inline-flex items-center gap-2"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          letterSpacing: "0.01em",
          color: "var(--text-secondary)",
          padding: "5px 10px",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-control)",
        }}
      >
        <span className="dot" style={{ background: "var(--safe-green)", width: 6, height: 6 }} />
        {truncated}
      </span>
      <HeaderNavLink href="/simulator" className="hidden md:inline-flex">
        Simulator
      </HeaderNavLink>
      <WalletMenu wallet={wallet} truncated={truncated} />
    </HeaderShell>
  );
}

function WalletMenu({
  wallet,
  truncated,
}: {
  wallet: string;
  truncated: string;
}) {
  const router = useRouter();
  const { disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(wallet);
    } catch {
      // clipboard blocked
    }
    setOpen(false);
  }

  async function disconnectAndGoHome() {
    if (pending) return;
    setPending(true);
    try {
      await fetch(getApiUrl("/api/auth/logout"), {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // server-side cookie clear; proceed anyway
    }
    try {
      await disconnect();
    } catch {
      // already disconnected
    }
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Mobile: the address is the trigger. Desktop: a compact glyph. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="btn btn-outline btn-sm sm:hidden"
      >
        {truncated}
      </button>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Wallet menu"
        className="hidden sm:inline-flex items-center justify-center btn btn-outline"
        style={{ width: 34, height: 34, padding: 0, fontSize: 16 }}
      >
        <span aria-hidden style={{ lineHeight: 0, marginTop: -6 }}>
          ⋯
        </span>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            minWidth: 210,
            background: "var(--bg-overlay)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-panel)",
            padding: 5,
            zIndex: 60,
            boxShadow: "var(--shadow-pop)",
          }}
        >
          <MenuItem onClick={copy}>Copy address</MenuItem>
          <a
            href={`https://solscan.io/account/${encodeURIComponent(wallet)}`}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            style={menuItemStyle}
            onClick={() => setOpen(false)}
          >
            View on Solscan ↗
          </a>
          <div style={{ height: 1, background: "var(--border-subtle)", margin: "5px 0" }} />
          <MenuItem onClick={disconnectAndGoHome} tone="threat" disabled={pending}>
            {pending ? "Disconnecting…" : "Disconnect"}
          </MenuItem>
        </div>
      )}
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "9px 11px",
  borderRadius: "var(--radius-control)",
  fontFamily: "var(--font-mono)",
  fontSize: 12.5,
  color: "var(--text-primary)",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  letterSpacing: 0,
};

function MenuItem({
  children,
  onClick,
  tone,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "threat";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...menuItemStyle,
        color: tone === "threat" ? "var(--threat-red)" : menuItemStyle.color,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}
