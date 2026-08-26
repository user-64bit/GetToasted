import { CommandBar } from "../_components/command-bar";
import { ScanInputPanel } from "../_components/scan-input-panel";
import { DashboardClient } from "./_components/dashboard-client";

interface DashboardPageProps {
  searchParams: Promise<{
    wallet?: string | string[];
  }>;
}

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const params = await searchParams;
  const wallet = firstParam(params.wallet)?.trim();

  if (!wallet) {
    return <NoWallet />;
  }

  return (
    <main style={{ minHeight: "100vh" }}>
      <DashboardClient wallet={wallet} />
    </main>
  );
}

function NoWallet() {
  return (
    <>
      <CommandBar />
      <main className="py-12 md:py-20">
        <div className="wrap" style={{ maxWidth: 720 }}>
          <p className="text-kicker" style={{ marginBottom: 14 }}>
            Dashboard
          </p>
          <h1 className="text-h1" style={{ color: "var(--text-primary)", marginBottom: 12 }}>
            No wallet in the URL yet.
          </h1>
          <p className="text-body-sm" style={{ marginBottom: 28, maxWidth: 560 }}>
            Paste a Solana address to start a forensic scan. It runs read-only —
            no transaction is signed.
          </p>
          <ScanInputPanel
            label="Scan a wallet"
            title="Paste a wallet."
            helper="Output per detection: attacker, validator, pool, confidence, and the exact USD extracted."
            ctaLabel="Run scan"
          />
        </div>
      </main>
    </>
  );
}
