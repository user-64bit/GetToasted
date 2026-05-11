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
            <header
              className="flex items-start justify-between flex-wrap gap-6"
              style={{ marginBottom: 40 }}
            >
              <div style={{ flex: 1, minWidth: 260 }}>
                <p
                  className="text-kicker"
                  style={{ marginBottom: 12, color: "var(--threat-red)" }}
                >
                  § FORENSIC REPORT / WALLET {truncated}
                </p>
                <h1
                  className="text-h1"
                  style={{ color: "var(--text-primary)" }}
                >
                  This wallet has been{" "}
                  <em>sandwiched.</em>
                </h1>
              </div>
              <LastScanned wallet={wallet} lastScanAt={data.lastScanAt} />
            </header>

            <KpiRow data={data} />

            <div style={{ marginTop: 40 }}>
              <LossesChart data={data.series} />
            </div>

            <div style={{ marginTop: 40 }}>
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
