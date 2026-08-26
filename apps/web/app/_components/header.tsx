import Link from "next/link";
import type { ReactNode } from "react";

type Tone = "brand" | "threat";

/**
 * The logomark encodes the product itself: a sandwich bracket. Two attacker
 * slices (outer) around the victim swap (centre, lime). It doubles as the
 * status indicator — the centre slice turns red once a wallet is toasted.
 */
export function BrandMark({
  tone = "brand",
  size = 18,
}: {
  tone?: Tone;
  size?: number;
}) {
  const mid = tone === "threat" ? "var(--threat-red)" : "var(--accent)";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      style={{ flexShrink: 0, display: "block" }}
    >
      <rect x="2" y="2.4" width="12" height="2.6" rx="1" fill="var(--text-tertiary)" />
      <rect x="2" y="6.7" width="12" height="2.6" rx="1" fill={mid} />
      <rect x="2" y="11" width="12" height="2.6" rx="1" fill="var(--text-tertiary)" />
    </svg>
  );
}

export function Brand({
  tone = "brand",
  href = "/",
}: {
  tone?: Tone;
  href?: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5"
      aria-label="GetToasted — home"
    >
      <BrandMark tone={tone} />
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: "-0.01em",
          color: "var(--text-primary)",
        }}
      >
        Get
        <span style={{ color: tone === "threat" ? "var(--threat-red)" : "var(--accent)" }}>
          Toasted
        </span>
      </span>
    </Link>
  );
}

/** Sticky masthead shell. Left = brand, right = supplied nav children. */
export function HeaderShell({
  tone = "brand",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <header className="masthead">
      <div className="wrap flex items-center gap-4" style={{ height: 56 }}>
        <Brand tone={tone} />
        <div className="ml-auto flex items-center gap-1.5">{children}</div>
      </div>
    </header>
  );
}

export function HeaderNavLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`nav-link ${className ?? ""}`}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        letterSpacing: "0.02em",
        padding: "8px 12px",
        borderRadius: "var(--radius-control)",
      }}
    >
      {children}
    </Link>
  );
}

/** A small always-visible network status marker. Honest, not decorative. */
export function NetworkTag() {
  return (
    <span
      className="hidden md:inline-flex items-center gap-1.5"
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.04em",
        color: "var(--text-tertiary)",
        padding: "5px 9px",
      }}
      title="Solana mainnet-beta"
    >
      <span className="dot" style={{ background: "var(--safe-green)", width: 6, height: 6 }} />
      mainnet
    </span>
  );
}
