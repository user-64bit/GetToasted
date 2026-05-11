import Link from "next/link";
import { ConnectWalletButton } from "./connect-wallet-button";

interface CommandBarProps {
  showMeta?: boolean;
}

export function CommandBar({ showMeta = true }: CommandBarProps) {
  return (
    <header className="masthead">
      <div
        className="mx-auto flex items-center justify-between gap-4"
        style={{
          maxWidth: 1280,
          padding: "12px 24px",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        <Link
          href="/"
          className="flex items-center gap-3"
          aria-label="GetToasted home"
        >
          <span aria-hidden className="gt-brand-dot" />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.08em",
              color: "var(--text-primary)",
              textTransform: "uppercase",
            }}
          >
            Get<span style={{ color: "var(--accent)" }}>Toasted</span>{" "}
            <span
              className="hidden sm:inline"
              style={{ color: "var(--text-tertiary)", fontWeight: 400 }}
            >
              / Field guide
            </span>
          </span>
        </Link>

        {showMeta ? (
          <div
            className="hidden lg:flex items-center"
            style={{
              gap: 24,
              color: "var(--text-tertiary)",
              fontWeight: 400,
            }}
          >
            <span>Vol.01 · No.001</span>
            <span>Solana · Mainnet-Beta</span>
          </div>
        ) : null}

        <div className="flex items-center gap-1">
          <NavLink href="/simulator">Simulator</NavLink>
          <ConnectWalletButton
            className="gt-btn inline-flex items-center gap-1.5"
            style={{
              background: "var(--accent)",
              color: "var(--text-inverse)",
              padding: "8px 14px",
              borderRadius: 4,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          />
        </div>
      </div>
    </header>
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
      className="nav-link hidden md:inline-flex"
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--text-secondary)",
        padding: "8px 14px",
        borderRadius: 4,
      }}
    >
      {children}
    </Link>
  );
}
