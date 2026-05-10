import Link from "next/link";

export function DashboardTopbar({ wallet }: { wallet: string }) {
  const truncated =
    wallet.length > 10 ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}` : wallet;

  return (
    <header
      className="flex items-center justify-between gap-4 md:hidden"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "color-mix(in srgb, var(--bg-surface) 92%, transparent)",
        borderBottom: "1px solid var(--border-subtle)",
        padding: "12px 16px",
        backdropFilter: "blur(16px)",
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
      <nav className="flex items-center gap-3">
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-tertiary)",
          }}
        >
          {truncated}
        </span>
        <Link
          href="/simulator"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--accent-strong)",
          }}
        >
          Simulator
        </Link>
      </nav>
    </header>
  );
}
