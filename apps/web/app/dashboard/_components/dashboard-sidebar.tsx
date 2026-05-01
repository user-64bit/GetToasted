import Link from "next/link";

interface DashboardSidebarProps {
  wallet: string;
}

export function DashboardSidebar({ wallet }: DashboardSidebarProps) {
  const truncated =
    wallet.length > 10 ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}` : wallet;

  return (
    <aside
      className="hidden md:flex flex-col sticky top-0 self-start z-30"
      style={{
        width: 240,
        flexShrink: 0,
        height: "100vh",
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border-subtle)",
        padding: "24px 0",
      }}
    >
      <div style={{ padding: "0 20px" }}>
        <Link
          href="/"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 16,
            fontWeight: 500,
            letterSpacing: "0.02em",
          }}
        >
          Get<span style={{ color: "var(--threat-red)" }}>Toasted</span>
        </Link>
      </div>

      <nav className="mt-10 flex flex-col" style={{ padding: "0 12px" }}>
        <NavItem href="/dashboard" active>
          Dashboard
        </NavItem>
        <NavItem href="/simulator">Simulator</NavItem>
        <NavItem href="/docs">Docs</NavItem>
      </nav>

      <div className="mt-auto" style={{ padding: "0 20px" }}>
        <p className="text-label" style={{ marginBottom: 6 }}>
          Connected
        </p>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            color: "var(--text-primary)",
          }}
        >
          {truncated}
        </p>
        <Link
          href="/"
          className="inline-block mt-3 transition-colors"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--text-secondary)",
          }}
        >
          Disconnect <span aria-hidden>↗</span>
        </Link>
      </div>
    </aside>
  );
}

function NavItem({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="block nav-link"
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 13,
        padding: "10px 12px",
        borderRadius: 6,
        color: active ? "var(--text-primary)" : "var(--text-secondary)",
        background: active ? "var(--bg-elevated)" : "transparent",
        marginBottom: 2,
      }}
    >
      {children}
    </Link>
  );
}
