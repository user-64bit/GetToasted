import { ConnectWalletButton } from "./connect-wallet-button";

export function CtaFooter() {
  return (
    <section
      style={{
        padding: "160px 24px 128px",
        borderTop: "1px solid var(--border-subtle)",
      }}
    >
      <div className="max-w-2xl mx-auto text-center">
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "clamp(24px, 3.2vw, 38px)",
            fontWeight: 500,
            color: "var(--text-primary)",
            letterSpacing: "-0.01em",
            lineHeight: 1.2,
          }}
        >
          You&apos;ve been trading on Solana.
        </p>
        <p
          className="mt-2"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "clamp(24px, 3.2vw, 38px)",
            fontWeight: 500,
            color: "var(--threat-red)",
            letterSpacing: "-0.01em",
            lineHeight: 1.2,
          }}
        >
          Have you been attacked?
        </p>

        <div className="mt-12 inline-block">
          <ConnectWalletButton
            label="Connect Wallet — It's Free"
            className="inline-flex items-center gt-btn"
            style={{
              background: "var(--accent)",
              color: "var(--text-inverse)",
              padding: "20px 32px",
              borderRadius: 8,
              fontFamily: "var(--font-mono)",
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: "0.04em",
              gap: 10,
            }}
          />
        </div>
      </div>
    </section>
  );
}
