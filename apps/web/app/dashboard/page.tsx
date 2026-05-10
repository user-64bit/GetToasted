import { DashboardClient } from "./_components/dashboard-client";
import { TerminalScanInput } from "../_components/terminal-scan-input";
import { CommandBar } from "../_components/command-bar";

interface DashboardPageProps {
  searchParams: Promise<{
    wallet?: string | string[];
  }>;
}

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
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
      <main
        className="min-h-screen flex items-center justify-center px-5"
        style={{ paddingTop: 96, paddingBottom: 48 }}
      >
        <section
          className="w-full"
          style={{
            maxWidth: 560,
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-panel)",
            padding: 28,
          }}
        >
          <p className="text-label">Dashboard</p>
          <h1 className="text-h1 mt-3">No wallet in the URL.</h1>
          <p
            className="mt-3"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 15,
              lineHeight: 1.55,
              color: "var(--text-secondary)",
            }}
          >
            Paste a Solana address below to start a forensic scan. The scan is
            read-only — no transaction is signed.
          </p>
          <div className="mt-6">
            <TerminalScanInput />
          </div>
        </section>
      </main>
    </>
  );
}
