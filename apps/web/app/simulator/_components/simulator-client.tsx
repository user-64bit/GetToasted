"use client";

import { useState, type FormEvent } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useSimulate } from "../../lib/api/simulate";
import { ApiError } from "../../lib/api/fetcher";
import type { SimulateResponse, SimulateVerdict } from "../../lib/api/types";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export function SimulatorClient() {
  const { publicKey, connected } = useWallet();
  const sim = useSimulate();

  const [wallet, setWallet] = useState("");
  const [inputMint, setInputMint] = useState(SOL_MINT);
  const [outputMint, setOutputMint] = useState(USDC_MINT);
  const [amount, setAmount] = useState("1000000000");

  const effectiveWallet =
    wallet.trim() || (connected && publicKey ? publicKey.toBase58() : "");

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!effectiveWallet || !inputMint || !outputMint || !amount) return;
    sim.mutate({
      wallet: effectiveWallet,
      inputMint: inputMint.trim(),
      outputMint: outputMint.trim(),
      amount: amount.trim(),
    });
  };

  return (
    <div>
      <form
        onSubmit={onSubmit}
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: 8,
          padding: 24,
        }}
      >
        <Field label="Wallet" hint="Defaults to your connected wallet.">
          <input
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            placeholder={
              connected && publicKey ? publicKey.toBase58() : "Solana address"
            }
            spellCheck={false}
            autoComplete="off"
            style={inputStyle}
          />
        </Field>

        <div className="grid gap-4 md:grid-cols-2 mt-4">
          <Field label="Input mint">
            <input
              value={inputMint}
              onChange={(e) => setInputMint(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              style={inputStyle}
            />
            <PresetRow
              presets={[
                { label: "SOL", value: SOL_MINT },
                { label: "USDC", value: USDC_MINT },
              ]}
              onPick={setInputMint}
            />
          </Field>
          <Field label="Output mint">
            <input
              value={outputMint}
              onChange={(e) => setOutputMint(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              style={inputStyle}
            />
            <PresetRow
              presets={[
                { label: "SOL", value: SOL_MINT },
                { label: "USDC", value: USDC_MINT },
              ]}
              onPick={setOutputMint}
            />
          </Field>
        </div>

        <Field
          label="Amount (atomic units)"
          hint="1 SOL = 1,000,000,000 lamports · 1 USDC = 1,000,000"
        >
          <input
            value={amount}
            onChange={(e) =>
              setAmount(e.target.value.replace(/[^0-9]/g, ""))
            }
            inputMode="numeric"
            placeholder="1000000000"
            style={inputStyle}
          />
        </Field>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="submit"
            disabled={sim.isPending || !effectiveWallet}
            className="gt-btn"
            style={{
              background: "var(--accent)",
              color: "var(--text-inverse)",
              padding: "12px 20px",
              borderRadius: 6,
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: "0.04em",
              opacity: sim.isPending || !effectiveWallet ? 0.6 : 1,
            }}
          >
            {sim.isPending ? "Simulating…" : "Simulate swap →"}
          </button>
          {!effectiveWallet && (
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--text-tertiary)",
              }}
            >
              Connect a wallet or paste an address.
            </p>
          )}
        </div>

        {sim.isError && (
          <p
            className="mt-4"
            role="alert"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--threat-red)",
            }}
          >
            {sim.error instanceof ApiError
              ? sim.error.message
              : (sim.error as Error).message}
          </p>
        )}
      </form>

      {sim.data && <Result data={sim.data} />}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  background: "var(--bg-overlay)",
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  padding: "10px 12px",
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  color: "var(--text-primary)",
} as const;

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span
        className="block mb-2"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--text-secondary)",
        }}
      >
        {label}
      </span>
      {children}
      {hint && (
        <span
          className="block mt-1"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-tertiary)",
          }}
        >
          {hint}
        </span>
      )}
    </label>
  );
}

function PresetRow({
  presets,
  onPick,
}: {
  presets: { label: string; value: string }[];
  onPick: (v: string) => void;
}) {
  return (
    <div className="mt-2 flex gap-2">
      {presets.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => onPick(p.value)}
          style={{
            background: "transparent",
            border: "1px solid var(--border-subtle)",
            borderRadius: 4,
            padding: "4px 8px",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-secondary)",
            cursor: "pointer",
          }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function Result({ data }: { data: SimulateResponse }) {
  return (
    <section
      className="mt-8"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 8,
        padding: 24,
      }}
    >
      <header className="flex items-center justify-between mb-6">
        <p className="text-label">Result</p>
        <VerdictBadge verdict={data.recommendation} />
      </header>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Stat label="Expected out" value={data.expectedOut} />
        <Stat
          label="Price impact"
          value={`${data.priceImpactPct.toFixed(4)}%`}
        />
        <Stat label="Sandwich attacks (7d)" value={data.sandwichCount7d} />
        <Stat
          label="Avg loss (7d)"
          value={data.avgLossUsd7d ? `$${data.avgLossUsd7d}` : "—"}
        />
        <Stat
          label="Pool risk score"
          value={data.poolRiskScore !== null ? data.poolRiskScore.toFixed(2) : "—"}
        />
        <Stat
          label="Trade size (USD)"
          value={data.amountUsd !== null ? `$${data.amountUsd.toFixed(2)}` : "—"}
        />
        <Stat
          label="Estimated MEV risk"
          value={
            data.estimatedMevRiskUsd !== null
              ? `$${data.estimatedMevRiskUsd.toFixed(2)}`
              : "—"
          }
          color="threat"
        />
        <Stat label="Pool" value={data.pool ? truncate(data.pool) : "—"} />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: "threat";
}) {
  return (
    <div>
      <p className="text-label" style={{ marginBottom: 4 }}>
        {label}
      </p>
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 18,
          fontWeight: 500,
          color: color === "threat" ? "var(--threat-red)" : "var(--text-primary)",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: SimulateVerdict }) {
  const map: Record<
    SimulateVerdict,
    { label: string; bg: string; color: string }
  > = {
    PROCEED: {
      label: "PROCEED",
      bg: "var(--safe-green-dim)",
      color: "var(--safe-green)",
    },
    PROCEED_WITH_CAUTION: {
      label: "CAUTION",
      bg: "var(--threat-amber-dim, rgba(255, 170, 0, 0.12))",
      color: "var(--threat-amber, #ffaa00)",
    },
    USE_MEV_PROTECTED_ROUTE: {
      label: "USE MEV-PROTECTED ROUTE",
      bg: "rgba(255, 71, 87, 0.12)",
      color: "var(--threat-red)",
    },
  };
  const v = map[verdict];
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: "0.12em",
        background: v.bg,
        color: v.color,
        padding: "6px 10px",
        borderRadius: 4,
      }}
    >
      {v.label}
    </span>
  );
}

function truncate(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
