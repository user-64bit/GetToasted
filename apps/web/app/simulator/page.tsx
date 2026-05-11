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
      <main className="px-5 py-12 md:px-10 md:py-16">
        <div className="mx-auto" style={{ maxWidth: 1280 }}>
          <header style={{ marginBottom: 40 }}>
            <p
              className="text-kicker"
              style={{ marginBottom: 16, color: "var(--accent)" }}
            >
              § PRE-TRADE / SWAP RISK SIMULATOR
            </p>
            <h1
              className="text-h1"
              style={{
                color: "var(--text-primary)",
                maxWidth: 720,
              }}
            >
              Read the route<br />
              <em>before</em> you sign it.
            </h1>
            <p
              className="text-body-sm"
              style={{ marginTop: 18, maxWidth: 640 }}
            >
              Quote a swap with Jupiter and check how often the destination
              pool has been sandwiched in the last seven days. Read-only —
              no transaction is signed.
            </p>
          </header>

          <SimulatorClient />
        </div>
      </main>
    </>
  );
}
