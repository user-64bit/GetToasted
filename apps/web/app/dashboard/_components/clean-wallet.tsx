import Link from "next/link";
import { LastScanned } from "./last-scanned";

interface CleanWalletProps {
  wallet: string;
  transactionsAnalyzed: number;
  lastScanAt: string | null;
}

export function CleanWallet({
  wallet,
  transactionsAnalyzed,
  lastScanAt,
}: CleanWalletProps) {
  return (
    <div
      className="flex items-center justify-center"
      style={{ minHeight: "70vh", padding: "48px 24px" }}
    >
      <div
        className="text-center"
        style={{
          padding: "56px 40px",
          borderRadius: 12,
          maxWidth: 480,
          background:
            "radial-gradient(ellipse 70% 60% at center, var(--safe-green-dim), transparent 70%)",
        }}
      >
        <svg
          width="64"
          height="64"
          viewBox="0 0 64 64"
          style={{ margin: "0 auto", display: "block" }}
          aria-hidden
        >
          <circle
            cx="32"
            cy="32"
            r="28"
            fill="none"
            stroke="var(--safe-green)"
            strokeWidth="2"
            opacity="0.4"
          />
          <path
            d="M20 33 L29 42 L44 24"
            fill="none"
            stroke="var(--safe-green)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="50"
            strokeDashoffset="50"
            style={{ animation: "draw-check 400ms 200ms ease-out forwards" }}
          />
        </svg>
        <p
          className="text-h1 mt-8"
          style={{ color: "var(--safe-green)", letterSpacing: "-0.01em" }}
        >
          You&apos;re clean.
        </p>
        <p
          className="mt-4"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 15,
            color: "var(--text-secondary)",
            lineHeight: 1.55,
          }}
        >
          No sandwich attacks detected across{" "}
          <span style={{ color: "var(--text-primary)" }}>
            {transactionsAnalyzed.toLocaleString("en-US")}
          </span>{" "}
          transactions analyzed.
        </p>

        <div className="mt-6">
          <LastScanned wallet={wallet} lastScanAt={lastScanAt} />
        </div>

        <div className="flex flex-wrap gap-3 justify-center mt-10">
          <button
            type="button"
            className="gt-btn-secondary"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              borderRadius: 6,
              padding: "12px 18px",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--text-primary)",
              cursor: "pointer",
              letterSpacing: "0.04em",
            }}
          >
            Share this result
          </button>
          <Link
            href="/"
            className="gt-btn"
            style={{
              background: "var(--safe-green)",
              color: "var(--text-inverse)",
              borderRadius: 6,
              padding: "12px 18px",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.04em",
            }}
          >
            Check another wallet
          </Link>
        </div>
      </div>
    </div>
  );
}
