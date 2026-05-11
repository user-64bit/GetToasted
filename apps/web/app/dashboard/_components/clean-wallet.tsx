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
    <main className="px-5 py-14 md:px-12 md:py-20">
      <div className="mx-auto" style={{ maxWidth: 920 }}>
        <p
          className="text-kicker"
          style={{ marginBottom: 16, color: "var(--safe-green)" }}
        >
          § FORENSIC VERDICT / NO ACTIVITY
        </p>

        <h1
          className="text-section"
          style={{
            color: "var(--text-primary)",
            maxWidth: 800,
            marginBottom: 32,
          }}
        >
          No sandwich.
          <br />
          <em style={{ color: "var(--safe-green)", fontStyle: "italic" }}>
            You&apos;re clean.
          </em>
        </h1>

        <div className="prose-editorial" style={{ maxWidth: 720 }}>
          <p>
            The forensic scan completed without finding a confirmed or
            suspected sandwich bracket against this wallet. Every signature
            was decoded, every same-pool neighbor checked, every same-slot
            actor against our bot registry — nothing matched. That
            doesn&apos;t mean you&apos;ve never been sandwiched on a different
            wallet, only that this one came back empty.
          </p>
        </div>

        <section
          style={{
            marginTop: 48,
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div
            className="clean-metrics"
            style={{
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <Metric label="Detections" value="0" tone="safe" />
            <Metric
              label="Transactions analyzed"
              value={transactionsAnalyzed.toLocaleString("en-US")}
            />
            <Metric label="Verdict" value="Clean" tone="safe" />
          </div>

          <div
            className="flex flex-wrap items-center justify-between gap-4"
            style={{ padding: "20px 24px" }}
          >
            <LastScanned wallet={wallet} lastScanAt={lastScanAt} />
            <Link
              href="/"
              className="gt-btn-secondary"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                padding: "10px 16px",
              }}
            >
              Check another wallet →
            </Link>
          </div>
        </section>
      </div>

    </main>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "safe";
}) {
  return (
    <div
      className="clean-metric"
      style={{
        padding: "24px 22px",
        borderRight: "1px solid var(--border-subtle)",
      }}
    >
      <p
        className="text-kicker"
        style={{ marginBottom: 12, color: "var(--text-tertiary)" }}
      >
        {label}
      </p>
      <p
        style={{
          fontFamily: "var(--font-display-family)",
          fontSize: "clamp(32px, 4vw, 44px)",
          fontWeight: 400,
          letterSpacing: "-0.02em",
          color: tone === "safe" ? "var(--safe-green)" : "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        {value}
      </p>
    </div>
  );
}
