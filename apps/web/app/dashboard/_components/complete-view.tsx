import { CleanWallet } from "./clean-wallet";
import { DashboardTopbar } from "./dashboard-topbar";
import { KpiRow } from "./kpi-row";
import { LastScanned } from "./last-scanned";
import { LossesChart } from "./losses-chart";
import { SandwichTable } from "./sandwich-table";
import type { DashboardData } from "./view-model";

interface CompleteViewProps {
  wallet: string;
  data: DashboardData;
}

export function CompleteView({ wallet, data }: CompleteViewProps) {
  const truncated =
    wallet.length > 10 ? `${wallet.slice(0, 4)}...${wallet.slice(-4)}` : wallet;

  return (
    <div style={{ minHeight: "100vh" }}>
      <DashboardTopbar wallet={wallet} />
      {data.attacksFound === 0 ? (
        <CleanWallet
          wallet={wallet}
          transactionsAnalyzed={data.transactionsAnalyzed}
          lastScanAt={data.lastScanAt}
        />
      ) : (
        <main className="px-5 py-10 md:px-10 md:py-14">
          <div className="max-w-6xl mx-auto">
              <header className="mb-10">
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 16,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <p className="text-label">Forensic report · {truncated}</p>
                    <h1 className="text-h1 mt-2">
                      This wallet has been sandwiched.
                    </h1>
                  </div>
                  <LastScanned wallet={wallet} lastScanAt={data.lastScanAt} />
                </div>
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
