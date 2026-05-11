import { CommandBar } from "./_components/command-bar";
import { PullQuote } from "./_components/pull-quote";
import { SampleScan } from "./_components/sample-scan";
import { ScanInputPanel } from "./_components/scan-input-panel";
import { SectionMarker } from "./_components/section-marker";

export default function Home() {
  return (
    <>
      <CommandBar />
      <main>
        <Hero />
        <MethodologySection />
        <BridgeQuote />
        <SampleSection />
        <RunScanSection />
        <Footer />
      </main>
    </>
  );
}

function Hero() {
  return (
    <section
      style={{
        position: "relative",
        padding: "80px 24px 56px",
        borderBottom: "1px solid var(--border-subtle)",
        overflow: "hidden",
      }}
    >
      <div
        className="mx-auto"
        style={{ maxWidth: 1280, position: "relative", zIndex: 2 }}
      >
        <div
          className="flex items-center"
          style={{
            gap: 16,
            marginBottom: 28,
            color: "var(--accent)",
          }}
        >
          <span
            aria-hidden
            style={{
              display: "inline-block",
              width: 48,
              height: 1,
              background: "var(--accent)",
            }}
          />
          <span className="text-kicker">Field Guide / The Anatomy of MEV</span>
          <span
            style={{
              padding: "4px 10px",
              border: "1px solid var(--accent)",
              borderRadius: 999,
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--accent)",
              fontWeight: 500,
            }}
          >
            Issue 01
          </span>
        </div>

        <h1 className="text-display" style={{ marginBottom: 32 }}>
          Every sandwich attack
          <br />
          on your wallet, <em>exposed.</em>
        </h1>

        <div
          className="hero-grid-cols"
          style={{
            display: "grid",
            gap: 64,
            paddingTop: 40,
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
    <div className="hero-deck-col">
      <p className="text-deck" style={{ maxWidth: 640 }}>
        Three transactions, one slot, one pool. A bot pays the validator. Your
        swap arrives in the middle &mdash;{" "}
        <strong>squeezed between two strangers who took your money</strong>{" "}
        before you knew you&apos;d lost it. GetToasted scans your wallet and
        quantifies the bill.
      </p>

      <dl className="hero-figures mt-10">
        <HeroFigure label="Extracted on Solana" sub="Helius 2024 MEV report" value="$370M+" />
        <HeroFigure label="Detection layers" sub="L1 mechanical → L4 statistical" value="4" />
        <HeroFigure label="Ground-truth recall" sub="Jito-bundle confirmed" value="30/30" />
      </dl>
    </div>
  );
}

function HeroFigure({
  label,
  sub,
  value,
}: {
  label: string;
  sub: string;
  value: string;
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-display-family)",
          fontSize: "clamp(28px, 3.4vw, 40px)",
          fontWeight: 400,
          letterSpacing: "-0.02em",
          color: "var(--text-primary)",
          lineHeight: 1,
          marginBottom: 10,
        }}
      >
        {value}
      </div>
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--text-secondary)",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-tertiary)",
          letterSpacing: "0.05em",
          marginTop: 4,
        }}
      >
        {sub}
      </p>
    </div>
  );
}

function HeroRight() {
  return (
    <ScanInputPanel
      num="00"
      label="Begin scan"
      title={
        <>
          Paste an address.<br />
          Read the verdict.
        </>
      }
      helper={
        <>
          The scan is read-only. We never request a signature, never broadcast
          a transaction, and never write to your wallet.
        </>
      }
    />
  );
}

/* ============================================================
   § 01 — Methodology
   ============================================================ */
function MethodologySection() {
  const layers = [
    {
      tag: "L1",
      tone: "threat" as const,
      title: "Jito-bundle membership",
      body: "When the front and back of a sandwich land in the same Jito bundle, the bracket is mechanical, not statistical. Confidence 1.00.",
    },
    {
      tag: "L2",
      tone: "threat" as const,
      title: "Same-pool nearest neighbors",
      body: "Validator-direct attacks bypass Jito. We match same-pool, signer-shared, direction-reversed adjacency at ≥95% sell-through.",
    },
    {
      tag: "L3",
      tone: "amber" as const,
      title: "Known-bot signers",
      body: "Same-slot patterns from registered MEV signers in our bot registry. Confirmed actor, suspected attack, marked amber.",
    },
    {
      tag: "L4",
      tone: "amber" as const,
      title: "Statistical fits",
      body: "Wide non-bundled brackets gated by five false-positive guards: layer-aware loss thresholds, slippage realism, sell-through floor.",
    },
  ];

  return (
    <section
      style={{
        padding: "96px 24px",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <div className="mx-auto" style={{ maxWidth: 1280 }}>
        <SectionMarker num="01" label="Methodology">
          Sandwich bots don&apos;t leave one fingerprint.<br />
          <em>Neither does this scanner.</em>
        </SectionMarker>

        <div className="section-prose" style={{ marginTop: 48 }}>
          <p className="text-body" style={{ marginBottom: 16 }}>
            Each layer trades coverage for confidence. We surface every layer
            separately so you can read the verdict without trusting the math.
            L1 is mechanical: same Jito bundle, signer-bracket inverted,
            confidence 1.00. L4 is statistical: wide same-slot pattern,
            confirmed actor unknown, marked amber.
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
              }}
            >
              pnpm harness validate-mined
            </code>
            . Every detection persists its layer, confidence, and loss method —
            no opaque scores.
          </p>
        </div>

        <div className="layer-grid" style={{ marginTop: 48 }}>
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
  const color =
    tone === "threat" ? "var(--threat-red)" : "var(--threat-amber)";
  return (
    <article
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderLeft: `2px solid ${color}`,
        padding: 24,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          marginBottom: 12,
          fontWeight: 600,
        }}
      >
        {tag}
      </div>
      <h3
        className="text-h2"
        style={{ marginBottom: 10, color: "var(--text-primary)" }}
      >
        {title}
      </h3>
      <p
        className="text-body-sm"
        style={{ color: "var(--text-secondary)" }}
      >
        {body}
      </p>
    </article>
  );
}

/* ============================================================
   Pull quote between § 01 and § 02
   ============================================================ */
function BridgeQuote() {
  return (
    <section
      style={{
        padding: "32px 24px 48px",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <div className="mx-auto" style={{ maxWidth: 1280 }}>
        <PullQuote attr="Invisible theft, made visible">
          Your slippage isn&apos;t bad luck.{" "}
          <span>It was engineered.</span>
        </PullQuote>
      </div>
    </section>
  );
}

/* ============================================================
   § 02 — Sample scan
   ============================================================ */
function SampleSection() {
  return (
    <section
      style={{
        padding: "96px 24px",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <div className="mx-auto" style={{ maxWidth: 1280 }}>
        <SectionMarker num="02" label="Sample scan">
          What a real verdict<br />
          <em>actually looks like.</em>
        </SectionMarker>

        <div className="section-prose" style={{ marginTop: 48 }}>
          <p className="text-body" style={{ marginBottom: 24 }}>
            A wallet you&apos;ve never heard of, scanned in fifteen seconds. Three
            confirmed brackets. $247.83 extracted. The attacker, validator,
            pool, layer, and confidence — all surfaced, all traceable on
            Solscan.
          </p>
        </div>

        <div
          className="report-frame"
          style={{
            marginTop: 48,
            padding: "48px 32px 32px",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--text-tertiary)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 24,
              paddingLeft: 32,
            }}
          >
            Fig. 01 ·{" "}
            <span style={{ color: "var(--accent)", fontWeight: 500 }}>
              The lifecycle of a forensic scan
            </span>{" "}
            · sample wallet · 30-day window
          </p>

          <SampleScan />
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   § 03 — Run the scan
   ============================================================ */
function RunScanSection() {
  return (
    <section style={{ padding: "96px 24px 112px" }}>
      <div className="mx-auto" style={{ maxWidth: 1280 }}>
        <SectionMarker num="03" label="Run the scan">
          The only useful verdict<br />
          is the one tied to <em>your</em> wallet.
        </SectionMarker>

        <div className="section-prose" style={{ marginTop: 48 }}>
          <p className="text-body" style={{ marginBottom: 32 }}>
            Paste a Solana address. The scan runs read-only against Helius and
            our detection pipeline; nothing is signed, nothing is broadcast,
            nothing leaves your wallet. The first detection lands in seconds.
          </p>
        </div>

        <div style={{ marginTop: 8, maxWidth: 760 }}>
          <ScanInputPanel
            num="03"
            label="Begin scan"
            title="Paste a wallet."
            helper="Read-only forensic scan. Output: attacker, validator, pool, confidence, USD extracted — per detection."
            ctaLabel="Run scan →"
          />
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   Footer
   ============================================================ */
function Footer() {
  return (
    <footer
      style={{
        padding: "48px 24px 32px",
        background: "var(--bg-base)",
        borderTop: "1px solid var(--border-subtle)",
      }}
    >
      <div
        className="mx-auto flex flex-wrap items-center justify-between gap-4"
        style={{
          maxWidth: 1280,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--text-tertiary)",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        <span>
          Get<span style={{ color: "var(--accent)" }}>Toasted</span> · Field
          Guide / Vol.01
        </span>
        <span>Built for Solana mainnet-beta · 2026</span>
      </div>
    </footer>
  );
}
