"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { getApiUrl } from "../../lib/api-url";

export function DashboardTopbar({ wallet }: { wallet: string }) {
  const truncated =
    wallet.length > 10 ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}` : wallet;

  return (
    <header
      className="flex items-center gap-4"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 30,
        background: "color-mix(in srgb, var(--bg-base) 92%, transparent)",
        borderBottom: "1px solid var(--border-subtle)",
        padding: "12px 20px",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      <Link
        href="/"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        Get<span style={{ color: "var(--threat-red)" }}>Toasted</span>
      </Link>

      <span
        aria-hidden
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "var(--text-muted)",
        }}
        className="hidden sm:inline"
      >
        /
      </span>

      <span
        className="hidden sm:inline-flex items-center gap-2"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "var(--text-secondary)",
          padding: "4px 10px",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 4,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: "var(--safe-green)",
          }}
        />
        {truncated}
      </span>

      <div className="ml-auto flex items-center gap-1">
        <Link
          href="/simulator"
          className="nav-link"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            color: "var(--text-secondary)",
            padding: "8px 12px",
            borderRadius: 6,
            letterSpacing: 0,
          }}
        >
          Simulator
        </Link>
        <WalletMenu wallet={wallet} truncated={truncated} />
      </div>
    </header>
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
      // ignore
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
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="gt-btn-secondary sm:hidden"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 6,
          padding: "8px 12px",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "var(--text-primary)",
          letterSpacing: 0,
        }}
      >
        {truncated}
      </button>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Wallet menu"
        className="hidden sm:inline-flex items-center justify-center gt-btn-secondary"
        style={{
          width: 32,
          height: 32,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 6,
          color: "var(--text-secondary)",
          fontFamily: "var(--font-mono)",
          fontSize: 14,
        }}
      >
        ⋯
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 6px)",
            minWidth: 200,
            background: "var(--bg-overlay)",
            border: "1px solid var(--border-default)",
            borderRadius: 6,
            padding: 4,
            zIndex: 40,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
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
          <div
            style={{
              height: 1,
              background: "var(--border-subtle)",
              margin: "4px 0",
            }}
          />
          <MenuItem
            onClick={disconnectAndGoHome}
            tone="threat"
            disabled={pending}
          >
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
  padding: "8px 10px",
  borderRadius: 4,
  fontFamily: "var(--font-mono)",
  fontSize: 12,
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
