import { SimulatorClient } from "./_components/simulator-client";

export const metadata = {
  title: "Simulator — GetToasted",
  description:
    "Estimate the MEV risk of a swap on Solana before you sign it.",
};

export default function SimulatorPage() {
  return (
    <main className="min-h-screen px-4 py-10 md:px-8 md:py-14">
      <div className="mx-auto max-w-6xl">
        <header className="mb-10">
          <p className="text-label">Tool · Pre-trade</p>
          <h1 className="text-h1 mt-2">Swap risk simulator</h1>
          <p
            className="mt-3"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 15,
              color: "var(--text-secondary)",
              lineHeight: 1.55,
            }}
          >
            Quote a swap with Jupiter and check how often the destination pool
            has been sandwiched in the last 7 days. No transaction is signed.
          </p>
        </header>

        <SimulatorClient />
      </div>
    </main>
  );
}
