import Link from "next/link";

export function CommandBar() {
  return (
    <nav className="command-bar fixed z-50 flex items-center">
      <Link
        href="/"
        className="flex items-center"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 14,
          fontWeight: 500,
          letterSpacing: "0.04em",
        }}
      >
        Get<span style={{ color: "var(--threat-red)" }}>Toasted</span>
      </Link>

      <div className="ml-auto flex items-center gap-1">
        <NavLink href="/docs" className="hidden md:block">Docs</NavLink>
        <NavLink href="#" className="hidden md:block">GitHub</NavLink>
        <Link
          href="/dashboard"
          className="gt-btn inline-flex items-center gap-1.5"
          style={{
            background: "var(--accent)",
            color: "var(--text-inverse)",
            padding: "8px 14px",
            borderRadius: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: "0.02em",
          }}
        >
          Connect Wallet <span aria-hidden>→</span>
        </Link>
      </div>
    </nav>
  );
}

function NavLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`nav-link ${className ?? ""}`}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 13,
        color: "var(--text-secondary)",
        padding: "8px 12px",
        borderRadius: 6,
      }}
    >
      {children}
    </Link>
  );
}
