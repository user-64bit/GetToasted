import Link from "next/link";

export function CommandBar() {
  return (
    <nav
      className="fixed left-1/2 -translate-x-1/2 z-50 flex items-center"
      style={{
        top: 24,
        background: "color-mix(in srgb, var(--bg-surface) 75%, transparent)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid var(--border-default)",
        borderRadius: 12,
        padding: "8px 8px 8px 20px",
        gap: 24,
        minWidth: 600,
        maxWidth: "calc(100vw - 32px)",
        width: "fit-content",
      }}
    >
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
        <NavLink href="/docs">Docs</NavLink>
        <NavLink href="#">GitHub</NavLink>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 transition-transform hover:-translate-y-px"
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
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="transition-colors"
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
