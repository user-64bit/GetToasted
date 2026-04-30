type TickerEntry = {
  attacker: string;
  amount: string;
  victim: string;
  ago: string;
};

const entries: TickerEntry[] = [
  { attacker: "DeezNode", amount: "12.4 SOL", victim: "3GhK...mPx2", ago: "2 minutes ago" },
  { attacker: "arsc-active", amount: "0.8 SOL", victim: "9fKL...3nRq", ago: "5 minutes ago" },
  { attacker: "arsc-cold", amount: "4.2 SOL", victim: "7vMq...kPa1", ago: "11 minutes ago" },
  { attacker: "DeezNode", amount: "1.6 SOL", victim: "2NhT...pXc8", ago: "14 minutes ago" },
  { attacker: "arsc-warm", amount: "23.1 SOL", victim: "Ax8B...wQp7", ago: "22 minutes ago" },
  { attacker: "DeezNode", amount: "0.9 SOL", victim: "6jKw...zRn4", ago: "29 minutes ago" },
];

function TickerItem({ entry }: { entry: TickerEntry }) {
  return (
    <span
      className="inline-flex items-center"
      style={{
        gap: 8,
        padding: "0 32px",
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        color: "var(--text-secondary)",
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden
        className="inline-block rounded-full"
        style={{
          width: 6,
          height: 6,
          background: "var(--threat-red)",
          animation: "threat-pulse 2s infinite",
        }}
      />
      <span style={{ color: "var(--threat-red)" }}>{entry.attacker}</span>
      <span> extracted </span>
      <span style={{ color: "var(--text-primary)" }}>{entry.amount}</span>
      <span> from </span>
      <span style={{ color: "var(--text-primary)" }}>{entry.victim}</span>
      <span style={{ color: "var(--text-tertiary)" }}> · {entry.ago}</span>
    </span>
  );
}

export function Ticker() {
  return (
    <div className="ticker-mask" style={{ padding: "12px 0" }}>
      <div className="ticker-track">
        {[0, 1].map((copy) => (
          <div key={copy} aria-hidden={copy === 1} className="flex items-center shrink-0">
            {entries.map((e, i) => (
              <TickerItem key={`${copy}-${i}`} entry={e} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
