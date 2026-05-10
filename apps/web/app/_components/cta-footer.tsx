import { TerminalScanInput } from "./terminal-scan-input";

export function CtaFooter() {
  return (
    <section
      style={{
        padding: "96px 24px 112px",
        borderTop: "1px solid var(--border-subtle)",
      }}
    >
      <div className="mx-auto max-w-3xl">
        <p className="text-label">Run the scan</p>
        <h2 className="text-h1 mt-3" style={{ maxWidth: 680 }}>
          The only useful verdict is the one tied to your wallet.
        </h2>
        <p
          className="mt-4"
          style={{
            maxWidth: 600,
            fontFamily: "var(--font-sans)",
            fontSize: 16,
            lineHeight: 1.55,
            color: "var(--text-secondary)",
          }}
        >
          Paste an address. The scan is read-only and no transaction is signed.
        </p>
        <div className="mt-8">
          <TerminalScanInput />
        </div>
      </div>
    </section>
  );
}
