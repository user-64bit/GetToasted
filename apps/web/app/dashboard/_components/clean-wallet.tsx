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
    <main className="px-4 py-10 md:px-12 md:py-16">
      <div className="mx-auto max-w-4xl">
        <p className="text-label">Forensic verdict</p>
        <h1 className="text-h1 mt-3">No sandwich attacks detected.</h1>
        <p
          className="mt-3"
          style={{
            maxWidth: 620,
            fontFamily: "var(--font-sans)",
            fontSize: 15,
            lineHeight: 1.55,
            color: "var(--text-secondary)",
          }}
        >
          The scan completed without finding a confirmed or suspected sandwich
          bracket against this wallet.
        </p>

        <section
          className="mt-8"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-panel)",
            overflow: "hidden",
          }}
        >
          <div
            className="grid gap-px sm:grid-cols-3"
            style={{ background: "var(--border-subtle)" }}
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
            style={{ padding: 20 }}
          >
            <LastScanned wallet={wallet} lastScanAt={lastScanAt} />
            <Link
              href="/"
              className="gt-btn-secondary"
              style={{
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-control)",
                padding: "10px 14px",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--text-primary)",
              }}
            >
              Check another wallet
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
    <div style={{ background: "var(--bg-surface)", padding: 18 }}>
      <p className="text-label">{label}</p>
      <p
        className="mt-2"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 28,
          color: tone === "safe" ? "var(--safe-green)" : "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </p>
    </div>
  );
}
