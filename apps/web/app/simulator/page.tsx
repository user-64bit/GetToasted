import { CommandBar } from "../_components/command-bar";
import { SimulatorClient } from "./_components/simulator-client";

export const metadata = {
  title: "Simulator — GetToasted",
  description:
    "Estimate the MEV risk of a swap on Solana before you sign it.",
};

export default function SimulatorPage() {
  return (
    <>
      <CommandBar />
      <main className="py-12 md:py-16">
        <div className="wrap">
          <header style={{ marginBottom: 36 }}>
            <p className="text-kicker" style={{ marginBottom: 14 }}>
              Pre-trade check
            </p>
            <h1 className="text-h1" style={{ color: "var(--text-primary)", maxWidth: 680 }}>
              Read the route <em>before</em> you sign it.
            </h1>
            <p className="text-body-sm" style={{ marginTop: 16, maxWidth: 620 }}>
              Quote a swap with Jupiter and check how often the destination pool
              has been sandwiched in the last seven days. Read-only — nothing is
              signed here.
            </p>
          </header>

          <SimulatorClient />
        </div>
      </main>
    </>
  );
}
