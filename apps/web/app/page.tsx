import { CommandBar } from "./_components/command-bar";
import { CtaFooter } from "./_components/cta-footer";
import { FloatingStats } from "./_components/floating-stats";
import { HowItWorks } from "./_components/how-it-works";
import { SampleScan } from "./_components/sample-scan";
import { TerminalScanInput } from "./_components/terminal-scan-input";
import { Ticker } from "./_components/ticker";

export default function Home() {
  return (
    <>
      <CommandBar />
      <main>
        <Hero />
        <Ticker />
        <HowItWorks />
        <SampleScan />
        <CtaFooter />
      </main>
    </>
  );
}

function Hero() {
  return (
    <section
      className="hero-grid relative overflow-hidden"
      style={{
        minHeight: "100svh",
        paddingTop: 120,
        paddingBottom: 96,
        paddingLeft: 24,
        paddingRight: 24,
      }}
    >
      <FloatingStats />
      <div className="reveal-stagger relative max-w-3xl mx-auto flex flex-col items-center text-center" style={{ marginTop: 56 }}>
        <p className="text-label">Forensic intelligence · Solana MEV</p>

        <h1 className="text-display mt-4" style={{ maxWidth: 720 }}>
          Every sandwich attack on your wallet.{" "}
          <span style={{ color: "var(--threat-red)" }}>Exposed.</span>
        </h1>

        <p
          className="mt-6"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 18,
            color: "var(--text-secondary)",
            lineHeight: 1.55,
            maxWidth: 520,
          }}
        >
          Solana MEV extraction has cost traders $500M+. Find out what was
          stolen from you.
        </p>

        <div className="mt-10 w-full" style={{ maxWidth: 640 }}>
          <TerminalScanInput />
        </div>

        <p
          className="mt-4"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-tertiary)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Free · No signup · Read-only
        </p>
      </div>
    </section>
  );
}
