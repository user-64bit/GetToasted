import Link from "next/link";
import { LastScanned } from "./last-scanned";

interface CleanWalletProps {
  wallet: string;
  transactionsAnalyzed: number;
  lastScanAt: string | null;
}

export function CleanWallet({ wallet, transactionsAnalyzed, lastScanAt }: CleanWalletProps) {
  return (
    <main className="py-14 md:py-20">
      <div className="wrap" style={{ maxWidth: 880 }}>
        <p className="text-kicker" style={{ marginBottom: 14, color: "var(--safe-green)" }}>
          Forensic verdict · clean
        </p>

        <h1 className="text-section" style={{ color: "var(--text-primary)", marginBottom: 26 }}>
          No sandwich found.
          <br />
          <span style={{ color: "var(--safe-green)" }}>You&apos;re clean.</span>
        </h1>

        <div className="prose-editorial" style={{ maxWidth: 640 }}>
          <p>
            The scan decoded every signature, checked every same-pool neighbour,
            and tested every same-slot actor against the bot registry —{" "}
            <strong>nothing bracketed this wallet.</strong> That doesn&apos;t
            prove you&apos;ve never been sandwiched on another wallet; it means
            this one came back empty.
          </p>
        </div>

        <section className="panel" style={{ marginTop: 40, overflow: "hidden" }}>
          <div className="clean-metrics" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <Metric label="Detections" value="0" tone="safe" />
            <Metric label="Transactions analyzed" value={transactionsAnalyzed.toLocaleString("en-US")} />
            <Metric label="Verdict" value="Clean" tone="safe" />
          </div>

          <div
            className="flex flex-wrap items-center justify-between gap-4"
            style={{ padding: "18px 22px" }}
          >
            <LastScanned wallet={wallet} lastScanAt={lastScanAt} />
            <Link href="/" className="btn btn-outline btn-sm">
              Check another wallet →
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "safe" }) {
  return (
    <div className="clean-metric" style={{ padding: "22px 22px" }}>
      <p className="text-label" style={{ marginBottom: 12 }}>
        {label}
      </p>
      <p
        className="tnum"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "clamp(28px, 3.6vw, 40px)",
          fontWeight: 500,
          letterSpacing: "-0.02em",
          color: tone === "safe" ? "var(--safe-green)" : "var(--text-primary)",
          lineHeight: 1,
        }}
      >
        {value}
      </p>
    </div>
  );
}
