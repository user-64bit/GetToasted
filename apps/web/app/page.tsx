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
      <p className="text-label">{label}</p>
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
  const layers: { layer: string; tone: "threat" | "amber"; title: string; body: string }[] = [
    {
      layer: "L1",
      tone: "threat",
      title: "Jito-bundle membership",
      body: "When the front and back of a sandwich land in the same Jito bundle, the bracket is mechanical, not statistical. Confidence 1.00.",
    },
    {
      layer: "L2",
      tone: "threat",
      title: "Nearest same-pool neighbors",
      body: "Validator-direct attacks bypass Jito. We match same-pool, signer-shared, direction-reversed adjacency at ≥95% sell-through.",
    },
    {
      layer: "L3 / L4",
      tone: "amber",
      title: "Known-bot + statistical",
      body: "Same-slot patterns from registered MEV signers, plus statistical fits with five false-positive guards. Suspected, marked amber.",
    },
  ];

  return (
    <section
      style={{
        padding: "96px 24px",
        borderTop: "1px solid var(--border-subtle)",
        background: "var(--bg-base)",
      }}
    >
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
          <div className="flex flex-col gap-8">
            <div>
              <p className="text-label">Why four layers</p>
              <h2 className="text-h1 mt-3" style={{ maxWidth: 520 }}>
                Sandwich bots don&apos;t leave one fingerprint. Neither does this scanner.
              </h2>
              <p
                className="mt-4"
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 15,
                  lineHeight: 1.6,
                  color: "var(--text-secondary)",
                  maxWidth: 460,
                }}
              >
                Each layer trades coverage for confidence. We surface every
                layer separately so you can read the verdict without trusting
                the math.
              </p>
            </div>

            <div
              className="grid grid-cols-2 gap-px"
              style={{
                background: "var(--border-subtle)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-panel)",
                overflow: "hidden",
                maxWidth: 460,
              }}
            >
              <EvidenceStat
                label="Ground-truth recall"
                value="30/30"
                hint="Jito-bundle confirmed"
                tone="threat"
              />
              <EvidenceStat
                label="False-positive guards"
                value="5"
                hint="applied at L4"
              />
            </div>

            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--text-tertiary)",
                letterSpacing: 0,
                maxWidth: 460,
                lineHeight: 1.55,
              }}
            >
              Reproducible offline via{" "}
              <span style={{ color: "var(--text-secondary)" }}>
                pnpm harness validate-mined
              </span>
              . Every detection persists its layer, confidence, and loss
              method — no opaque scores.
            </p>
          </div>

          <div className="flex flex-col" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            {layers.map((l) => (
              <div
                key={l.layer}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(72px, auto) 1fr",
                  gap: 24,
                  padding: "24px 0",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 13,
                    color:
                      l.tone === "threat"
                        ? "var(--threat-red)"
                        : "var(--threat-amber)",
                    letterSpacing: 0,
                    paddingTop: 2,
                  }}
                >
                  {l.layer}
                </span>
                <div>
                  <p
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 14,
                      color: "var(--text-primary)",
                      letterSpacing: 0,
                    }}
                  >
                    {l.title}
                  </p>
                  <p
                    className="mt-2"
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: 14,
                      lineHeight: 1.55,
                      color: "var(--text-secondary)",
                    }}
                  >
                    {l.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function EvidenceStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "threat";
}) {
  return (
    <div style={{ background: "var(--bg-base)", padding: "16px 18px" }}>
      <p className="text-label">{label}</p>
      <p
        className="mt-2"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 28,
          color:
            tone === "threat" ? "var(--threat-red)" : "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: 0,
          lineHeight: 1,
        }}
      >
        {value}
      </p>
      <p
        className="mt-2"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--text-tertiary)",
          letterSpacing: 0,
        }}
      >
        {hint}
      </p>
    </div>
  );
}
