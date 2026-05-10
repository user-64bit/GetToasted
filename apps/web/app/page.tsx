import { CommandBar } from "./_components/command-bar";
import { CtaFooter } from "./_components/cta-footer";
import { SampleScan } from "./_components/sample-scan";
import { TerminalScanInput } from "./_components/terminal-scan-input";

export default function Home() {
  return (
    <>
      <CommandBar />
      <main>
        <Hero />
        <EvidenceBand />
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
        paddingTop: 112,
        paddingBottom: 48,
        paddingLeft: 24,
        paddingRight: 24,
      }}
    >
      <div
        className="reveal-stagger relative mx-auto grid max-w-6xl gap-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(440px,1.08fr)] lg:items-start"
        style={{ minHeight: "calc(100svh - 160px)" }}
      >
        <div>
          <p className="text-label">Forensic intelligence / Solana MEV</p>

          <h1 className="text-display mt-4" style={{ maxWidth: 760 }}>
            Every sandwich attack on your wallet, exposed.
          </h1>

          <p
            className="mt-6"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 18,
              color: "var(--text-secondary)",
              lineHeight: 1.55,
              maxWidth: 560,
            }}
          >
            Paste a Solana address and get a forensic report: attacker,
            validator, pool, confidence layer, and USD extracted.
          </p>

          <div className="mt-10 w-full" style={{ maxWidth: 680 }}>
            <TerminalScanInput />
          </div>

          <div
            className="mt-5 grid grid-cols-3 gap-px"
            style={{
              maxWidth: 680,
              background: "var(--border-subtle)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-panel)",
              overflow: "hidden",
            }}
          >
            <HeroStat label="Detection layers" value="L1-L4" />
            <HeroStat label="Demo recall" value="30/30" />
            <HeroStat label="Signing" value="Never" />
          </div>
        </div>

        <SampleScan />
      </div>
    </section>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "var(--bg-surface)", padding: "12px 14px" }}>
      <p className="text-label" style={{ fontSize: 9 }}>
        {label}
      </p>
      <p
        className="mt-1"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 18,
          color: "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function EvidenceBand() {
  const items = [
    ["L1", "Jito-bundle membership confirms the bracket."],
    ["L2", "Nearest same-pool neighbors catch validator-direct attacks."],
    ["L3/L4", "Known-bot and statistical layers flag wider suspected abuse."],
  ];

  return (
    <section style={{ padding: "72px 24px", borderTop: "1px solid var(--border-subtle)" }}>
      <div className="mx-auto grid max-w-6xl gap-px md:grid-cols-3" style={{ background: "var(--border-subtle)", border: "1px solid var(--border-subtle)" }}>
        {items.map(([label, text]) => (
          <div key={label} style={{ background: "var(--bg-base)", padding: 24 }}>
            <p className="text-label">{label}</p>
            <p
              className="mt-3"
              style={{
                color: "var(--text-secondary)",
                fontFamily: "var(--font-sans)",
                fontSize: 15,
                lineHeight: 1.55,
              }}
            >
              {text}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
