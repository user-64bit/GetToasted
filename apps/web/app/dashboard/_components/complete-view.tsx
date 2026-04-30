import { CleanWallet } from "./clean-wallet";
import { DashboardSidebar } from "./dashboard-sidebar";
import { KpiRow } from "./kpi-row";
import { LossesChart } from "./losses-chart";
import type { DashboardMock } from "./mock-data";
import { SandwichTable } from "./sandwich-table";

interface CompleteViewProps {
  wallet: string;
  data: DashboardMock;
}

export function CompleteView({ wallet, data }: CompleteViewProps) {
  const truncated =
    wallet.length > 10 ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}` : wallet;

  return (
    <div className="md:pl-60" style={{ minHeight: "100vh" }}>
      <DashboardSidebar wallet={wallet} />

      {data.attacksFound === 0 ? (
        <CleanWallet transactionsAnalyzed={data.transactionsAnalyzed} />
      ) : (
        <main className="px-6 py-12 md:px-12 md:py-16">
          <div className="max-w-6xl mx-auto">
            <header className="mb-10">
              <p className="text-label">Wallet · {truncated}</p>
              <h1 className="text-h1 mt-2">Forensic report</h1>
              <p
                className="mt-2"
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 14,
                  color: "var(--text-secondary)",
                }}
              >
                Scanned{" "}
                <span style={{ color: "var(--text-primary)" }}>
                  {data.transactionsAnalyzed.toLocaleString("en-US")}
                </span>{" "}
                transactions ·{" "}
                <span style={{ color: "var(--threat-red)" }}>
                  {data.attacksFound} sandwich attacks detected
                </span>
              </p>
            </header>

            <KpiRow data={data} />

            <div className="mt-8">
              <LossesChart data={data.series} />
            </div>

            <div className="mt-8">
              <SandwichTable
                sandwiches={data.sandwiches}
                referenceNow={data.referenceNow}
              />
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
