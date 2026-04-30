import { AttackerAddress } from "@get-toasted/ui/attacker-address";
import { MonoNumber } from "@get-toasted/ui/mono-number";
import { RiskMeter } from "@get-toasted/ui/risk-meter";
import { SandwichCard } from "@get-toasted/ui/sandwich-card";
import { ScanProgress } from "@get-toasted/ui/scan-progress";
import { ThreatBadge } from "@get-toasted/ui/threat-badge";

const sample = {
  id: "1",
  detectedAt: new Date("2026-02-12T15:32:00Z"),
  pool: "Raydium",
  pair: "SOL/USDC",
  lossUsd: 142.2,
  attacker: "9973huxmxR8sTxjZTvkLF7eDzVZNMvz5fG7QsRpwzWp6",
  txSignature: "5xY3...mQ91",
  slot: 301827491,
};

export default function Home() {
  return (
    <main className="min-h-screen px-8 py-16">
      <div className="max-w-3xl mx-auto">
        <p className="text-label">Foundation preview · step 3</p>
        <h1 className="text-h1 mt-2">
          Get<span style={{ color: "var(--threat-red)" }}>Toasted</span>{" "}
          component library
        </h1>

        <Section title="Threat badges">
          <div className="flex gap-2 flex-wrap">
            <ThreatBadge level="high" />
            <ThreatBadge level="medium" />
            <ThreatBadge level="low" />
            <ThreatBadge level="none" />
          </div>
        </Section>

        <Section title="Mono number (animated counter)">
          <span className="text-mono-lg">
            <MonoNumber value={247.83} prefix="$" color="threat" animated />
          </span>
        </Section>

        <Section title="Attacker address (click to copy)">
          <AttackerAddress address="9973huxmxR8sTxjZTvkLF7eDzVZNMvz5fG7QsRpwzWp6" />
        </Section>

        <Section title="Risk meter">
          <RiskMeter score={0.82} label="Risk score" />
        </Section>

        <Section title="Scan progress">
          <ScanProgress
            progress={47}
            sandwichesFound={3}
            transactionsAnalyzed={1247}
            walletAddress="9fKL...3nRq"
          />
        </Section>

        <Section title="Sandwich card (new)">
          <SandwichCard sandwich={sample} isNew />
        </Section>
      </div>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="mt-12"
      style={{
        paddingTop: 24,
        borderTop: "1px solid var(--border-subtle)",
      }}
    >
      <p className="text-label mb-4">{title}</p>
      {children}
    </section>
  );
}
