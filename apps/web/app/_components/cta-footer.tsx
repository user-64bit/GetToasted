import Link from "next/link";

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

        <Link
          href="/dashboard"
          className="inline-flex items-center mt-12 gt-btn"
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
        >
          Connect Wallet — It&apos;s Free <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
}
