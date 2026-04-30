import { Reveal } from "./reveal";

const steps = [
  {
    n: "01",
    title: "Connect your wallet",
    desc: "Or paste any Solana address. No signup, no email — just an address.",
  },
  {
    n: "02",
    title: "We scan every swap",
    desc: "Every Raydium, Orca, and Meteora trade you've ever made — analyzed slot by slot.",
  },
  {
    n: "03",
    title: "See every attack",
    desc: "Each sandwich, the attacker, the validator that landed it, and the dollar amount they took from you.",
  },
];

export function HowItWorks() {
  return (
    <section
      style={{ padding: "128px 24px", borderTop: "1px solid var(--border-subtle)" }}
    >
      <div className="max-w-5xl mx-auto">
        <p className="text-label">How it works</p>
        <h2 className="text-h1 mt-3" style={{ maxWidth: 520 }}>
          Three steps. No theatrics.
        </h2>

        <Reveal threshold={0.15} className="mt-16">
          <div className="grid gap-12 md:grid-cols-3 md:gap-8 relative">
            {steps.map((s, i) => (
              <div key={s.n} className="relative">
                <div
                  aria-hidden
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 80,
                    fontWeight: 500,
                    color: "var(--border-strong)",
                    lineHeight: 1,
                    letterSpacing: "-0.04em",
                  }}
                >
                  {s.n}
                </div>
                <h3
                  className="mt-4"
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 20,
                    fontWeight: 500,
                    color: "var(--text-primary)",
                  }}
                >
                  {s.title}
                </h3>
                <p
                  className="mt-2"
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: "var(--text-secondary)",
                    maxWidth: 280,
                  }}
                >
                  {s.desc}
                </p>
                {i < steps.length - 1 && (
                  <div
                    aria-hidden
                    className="hidden md:block step-connector absolute"
                    style={{
                      top: 40,
                      left: "calc(100% - 16px)",
                      width: "calc(100% - 48px)",
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
