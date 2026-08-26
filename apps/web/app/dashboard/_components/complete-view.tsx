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
  return (
    <div style={{ minHeight: "100vh" }}>
      <DashboardTopbar wallet={wallet} tone={data.attacksFound > 0 ? "threat" : "brand"} />
      {data.attacksFound === 0 ? (
        <CleanWallet
          wallet={wallet}
          transactionsAnalyzed={data.transactionsAnalyzed}
          lastScanAt={data.lastScanAt}
        />
      ) : (
        <main className="py-10 md:py-14">
          <div className="wrap" style={{ maxWidth: 1080 }}>
            <header
              className="flex items-start justify-between flex-wrap gap-6"
              style={{ marginBottom: 32 }}
            >
              <div style={{ flex: 1, minWidth: 260 }}>
                <p className="text-kicker" style={{ marginBottom: 12, color: "var(--threat-red)" }}>
                  Forensic verdict
                </p>
                <h1 className="text-section" style={{ color: "var(--text-primary)" }}>
                  This wallet has been{" "}
                  <span style={{ color: "var(--threat-red)" }}>sandwiched.</span>
                </h1>
              </div>
              <LastScanned wallet={wallet} lastScanAt={data.lastScanAt} />
            </header>

            <KpiRow data={data} />

            <div style={{ marginTop: 32 }}>
              <LossesChart data={data.series} />
            </div>

            <div style={{ marginTop: 32 }}>
              <SandwichTable sandwiches={data.sandwiches} referenceNow={data.referenceNow} />
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
