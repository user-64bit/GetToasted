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
      <main className="px-5 py-12 md:px-10 md:py-20">
        <div className="mx-auto" style={{ maxWidth: 720 }}>
          <p className="text-kicker" style={{ marginBottom: 16 }}>
            § DASHBOARD / NO WALLET
          </p>
          <h1
            className="text-h1"
            style={{ color: "var(--text-primary)", marginBottom: 12 }}
          >
            No wallet in <em>the URL.</em>
          </h1>
          <p
            className="text-body-sm"
            style={{ marginBottom: 32, maxWidth: 560 }}
          >
            Paste a Solana address below to start a forensic scan. The scan is
            read-only — no transaction is signed.
          </p>
          <ScanInputPanel
            label="Begin scan"
            title="Paste a wallet."
            helper="Output: attacker, validator, pool, confidence, USD extracted — per detection."
          />
        </div>
      </main>
    </>
  );
}
