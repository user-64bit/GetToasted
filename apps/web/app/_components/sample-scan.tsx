import { AttackerAddress } from "@get-toasted/ui/attacker-address";
import { MonoNumber } from "@get-toasted/ui/mono-number";
import { Reveal } from "./reveal";

const sample = {
  wallet: "9973huxmxR8sTxjZTvkLF7eDzVZNMvz5fG7QsRpwzWp6",
  totalLossUsd: 247.83,
  attacksFound: 3,
  topAttack: {
    date: "Feb 12, 2026",
    pool: "Raydium",
    pair: "SOL/USDC",
    lossUsd: 142.2,
    attacker: "ArscACTiveSandWichBoTpUbKey1111111111111111",
    validator: "DeezNode",
  },
};

export function SampleScan() {
  return (
    <section
      style={{ padding: "96px 24px", borderTop: "1px solid var(--border-subtle)" }}
    >
      <div className="max-w-3xl mx-auto">
        <p className="text-label">A taste · sample scan</p>
        <h2 className="text-h1 mt-3" style={{ maxWidth: 520 }}>
          Here&apos;s what your dashboard could look like.
        </h2>

        <Reveal threshold={0.25} className="mt-12">
          <article
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <header
              className="flex items-center justify-between"
              style={{
                padding: "14px 20px",
                borderBottom: "1px solid var(--border-subtle)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.15em",
                color: "var(--text-secondary)",
                textTransform: "uppercase",
              }}
            >
              <span>
                Sample scan · 9973h...zWp6
              </span>
              <span style={{ color: "var(--threat-red)" }}>
                {sample.attacksFound} attacks found
              </span>
            </header>

            <div style={{ padding: 24 }}>
              <div className="flex items-baseline justify-between flex-wrap gap-3">
                <span
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: 14,
                    color: "var(--text-secondary)",
                  }}
                >
                  Total extracted from this wallet
                </span>
                <span className="text-mono-lg">
                  <MonoNumber
                    value={sample.totalLossUsd}
                    prefix="$"
                    color="threat"
                    animated
                  />
                </span>
              </div>

              <article
                className="mt-6"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-subtle)",
                  borderLeft: "2px solid var(--threat-red)",
                  borderRadius: 6,
                  padding: "16px 20px",
                }}
              >
                <div
                  className="flex flex-wrap items-center gap-x-2"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 13,
                    color: "var(--text-secondary)",
                  }}
                >
                  <span style={{ color: "var(--threat-red)" }}>●</span>
                  <span>{sample.topAttack.date}</span>
                  <span style={{ color: "var(--text-tertiary)" }}>·</span>
                  <span>
                    {sample.topAttack.pool} {sample.topAttack.pair}
                  </span>
                  <span style={{ color: "var(--text-tertiary)" }}>·</span>
                  <span style={{ color: "var(--threat-red)" }}>
                    ${sample.topAttack.lossUsd.toFixed(2)} lost
                  </span>
                </div>
                <div
                  className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1"
                  style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
                >
                  <span style={{ color: "var(--text-secondary)" }}>Attacker:</span>
                  <AttackerAddress address={sample.topAttack.attacker} />
                  <span style={{ color: "var(--text-tertiary)" }}>·</span>
                  <span style={{ color: "var(--text-secondary)" }}>Validator:</span>
                  <span style={{ color: "var(--text-primary)" }}>
                    {sample.topAttack.validator}
                  </span>
                </div>
                <a
                  href="#"
                  className="inline-flex items-center mt-3"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    color: "var(--accent)",
                    gap: 4,
                  }}
                >
                  View Transaction <span aria-hidden>↗</span>
                </a>
              </article>

              <p
                className="mt-4"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: "var(--text-tertiary)",
                  letterSpacing: "0.05em",
                }}
              >
                (2 more collapsed...)
              </p>
            </div>
          </article>
        </Reveal>
      </div>
    </section>
  );
}
