import { CleanWallet } from "./clean-wallet";
import { DashboardSidebar } from "./dashboard-sidebar";
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
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <DashboardSidebar wallet={wallet} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <DashboardTopbar wallet={wallet} />
        {data.attacksFound === 0 ? (
          <CleanWallet
            wallet={wallet}
            transactionsAnalyzed={data.transactionsAnalyzed}
            lastScanAt={data.lastScanAt}
          />
        ) : (
          <main className="px-6 py-12 md:px-12 md:py-16">
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
    </div>
  );
}
