import { CommandBar } from "./_components/command-bar";
import { SampleScan } from "./_components/sample-scan";
import { ScanInputPanel } from "./_components/scan-input-panel";
import { SectionMarker } from "./_components/section-marker";

export default function Home() {
  return (
    <>
      <CommandBar />
      <main>
        <Hero />
        <SampleSection />
        <MethodologySection />
        <RunScanSection />
        <Footer />
      </main>
    </>
  );
}

/* ============================================================ Hero */
function Hero() {
  return (
    <section
      style={{ padding: "72px 0 52px", borderBottom: "1px solid var(--border-subtle)" }}
    >
      <div className="wrap">
        <div className="flex items-center gap-3" style={{ marginBottom: 26 }}>
          <span aria-hidden style={{ width: 40, height: 1, background: "var(--accent)" }} />
          <span className="text-kicker">Solana · MEV forensics</span>
        </div>

        <h1 className="text-display" style={{ marginBottom: 0 }}>
          Every sandwich attack
          <br />
          on your wallet, <em>reconstructed.</em>
        </h1>

        <div
          className="hero-grid-cols"
          style={{
            display: "grid",
            gap: 56,
            paddingTop: 40,
            marginTop: 40,
            borderTop: "1px solid var(--border-subtle)",
            alignItems: "start",
          }}
        >
          <HeroLeft />
          <HeroRight />
        </div>
      </div>
    </section>
  );
}

function HeroLeft() {
  return (
    <div>
      <p className="text-deck" style={{ maxWidth: 560 }}>
        A sandwich is three transactions in one Solana slot: a bot buys just
        before your swap, lets you fill at the worse price, then sells right
        after. <strong>GetToasted finds every one against your wallet — and
        prices it to the cent.</strong>
      </p>

      <dl className="hero-figures" style={{ marginTop: 36 }}>
        <HeroFigure value="$370M+" label="Extracted on Solana" sub="Helius 2024 MEV report" />
        <HeroFigure value="4" label="Detection layers" sub="mechanical → statistical" />
        <HeroFigure value="30/30" label="Ground-truth recall" sub="Jito-bundle confirmed" />
      </dl>
    </div>
  );
}

function HeroFigure({ value, label, sub }: { value: string; label: string; sub: string }) {
  return (
    <div>
      <div
        className="tnum"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "clamp(26px, 3vw, 34px)",
          fontWeight: 500,
          letterSpacing: "-0.02em",
          color: "var(--text-primary)",
          lineHeight: 1,
          marginBottom: 10,
        }}
      >
        {value}
      </div>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {label}
      </p>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 4 }}>
        {sub}
      </p>
    </div>
  );
}

function HeroRight() {
  return (
    <ScanInputPanel
      label="Scan a wallet"
      title="Paste an address. Read the verdict."
      helper="Read-only. We never request a signature, never broadcast a transaction, and never touch your funds."
      ctaLabel="Run scan"
    />
  );
}

/* ============================================================ § 01 Sample */
function SampleSection() {
  return (
    <section style={{ padding: "84px 0", borderBottom: "1px solid var(--border-subtle)" }}>
      <div className="wrap">
        <SectionMarker num="01" label="A real verdict">
          This is a verdict,
          <br />
          <em>not a guess.</em>
        </SectionMarker>

        <div className="section-prose" style={{ marginTop: 40 }}>
          <p className="text-body">
            Every detection carries its layer, its confidence, and the method
            used to price the loss. You can read it without trusting the math —
            every leg of the bracket links straight to Solscan.
          </p>
        </div>

        <div style={{ marginTop: 40, maxWidth: 760 }}>
          <SampleScan />
        </div>
      </div>
    </section>
  );
}

/* ============================================================ § 02 Method */
function MethodologySection() {
  const layers = [
    {
      tag: "L1 · Jito bundle",
      tone: "threat" as const,
      title: "Mechanical proof",
      body: "When the front and back of a bracket land in the same Jito bundle, it is not a guess. Confidence 1.00.",
    },
    {
      tag: "L2 · Adjacent",
      tone: "threat" as const,
      title: "Same-pool neighbours",
      body: "Validator-direct attacks skip Jito. We match same-pool, shared-signer, direction-reversed swaps at ≥95% sell-through.",
    },
    {
      tag: "L3 · Known bot",
      tone: "amber" as const,
      title: "Registered actors",
      body: "Same-slot patterns from signers in our MEV bot registry. Confirmed actor, suspected attack.",
    },
    {
      tag: "L4 · Statistical",
      tone: "amber" as const,
      title: "Guarded inference",
      body: "Wide non-bundled brackets, gated by five false-positive guards: sell-through floor, slippage realism, size and index proximity.",
    },
  ];

  return (
    <section style={{ padding: "84px 0", borderBottom: "1px solid var(--border-subtle)" }}>
      <div className="wrap">
        <SectionMarker num="02" label="How it reads">
          Four layers.
          <br />
          <em>You can see each one.</em>
        </SectionMarker>

        <div className="section-prose" style={{ marginTop: 40 }}>
          <p className="text-body" style={{ marginBottom: 14 }}>
            Each layer trades coverage for certainty, and we label which one
            fired. L1 is mechanical — same bundle, inverted bracket. L4 is
            statistical — a wide same-slot pattern with the actor unconfirmed.
            You always know which you are looking at.
          </p>
          <p className="text-body-sm">
            Reproducible offline via{" "}
            <code
              style={{
                fontFamily: "var(--font-mono)",
                background: "var(--bg-elevated)",
                padding: "1px 6px",
                fontSize: "0.9em",
                color: "var(--accent)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-chip)",
              }}
            >
              pnpm harness validate-mined
            </code>
            . Every detection persists its layer, confidence and loss method.
          </p>
        </div>

        <div className="layer-grid" style={{ marginTop: 40 }}>
          {layers.map((l) => (
            <LayerCard key={l.tag} {...l} />
          ))}
        </div>
      </div>
    </section>
  );
}

function LayerCard({
  tag,
  tone,
  title,
  body,
}: {
  tag: string;
  tone: "threat" | "amber";
  title: string;
  body: string;
}) {
  const color = tone === "threat" ? "var(--threat-red)" : "var(--threat-amber)";
  return (
    <article
      className="panel"
      style={{ borderLeft: `2px solid ${color}`, padding: 22 }}
    >
      <span className={tone === "threat" ? "chip chip-threat" : "chip chip-amber"}>{tag}</span>
      <h3 className="text-h2" style={{ margin: "14px 0 8px", color: "var(--text-primary)" }}>
        {title}
      </h3>
      <p className="text-body-sm">{body}</p>
    </article>
  );
}

/* ============================================================ § 03 Run scan */
function RunScanSection() {
  return (
    <section style={{ padding: "84px 0 104px" }}>
      <div className="wrap">
        <SectionMarker num="03" label="Run the scan">
          The only verdict that
          <br />
          matters is <em>yours.</em>
        </SectionMarker>

        <div className="section-prose" style={{ marginTop: 40 }}>
          <p className="text-body" style={{ marginBottom: 28 }}>
            Paste a Solana address. The scan runs read-only against Helius and
            the detection pipeline — nothing is signed, nothing is broadcast.
            The first bracket usually lands within seconds.
          </p>
        </div>

        <div className="section-prose" style={{ marginTop: 4, maxWidth: 720 }}>
          <ScanInputPanel
            label="Scan a wallet"
            title="Paste a wallet."
            helper="Output per detection: attacker, validator, pool, confidence, and the exact USD extracted."
            ctaLabel="Run scan"
          />
        </div>
      </div>
    </section>
  );
}

/* ============================================================ Footer */
function Footer() {
  return (
    <footer style={{ padding: "40px 0 32px", background: "var(--bg-base)", borderTop: "1px solid var(--border-subtle)" }}>
      <div
        className="wrap flex flex-wrap items-center justify-between gap-3"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--text-tertiary)",
          letterSpacing: "0.04em",
        }}
      >
        <span>
          Get<span style={{ color: "var(--accent)" }}>Toasted</span> · Solana MEV forensics
        </span>
        <span>Read-only · mainnet-beta · 2026</span>
      </div>
    </footer>
  );
}
