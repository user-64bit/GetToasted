"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useSimulate } from "../../lib/api/simulate";
import { ApiError } from "../../lib/api/fetcher";
import type { SimulateResponse, SimulateVerdict } from "../../lib/api/types";
import {
  KNOWN_MINTS,
  fromAtomicAmount,
  getMintInfo,
  toAtomicAmount,
  type MintInfo,
} from "./mints";

const DEFAULT_INPUT = KNOWN_MINTS[0]!; // SOL
const DEFAULT_OUTPUT = KNOWN_MINTS[1]!; // USDC
const SAMPLE_AMOUNT = "1";

const KPI_HELP: Record<string, string> = {
  "Expected out":
    "Atomic units the swap is quoted to deliver, before slippage.",
  "Price impact":
    "How much the trade itself moves the pool price, per Jupiter's quote.",
  "Sandwich attacks (7d)":
    "Sandwiches we've detected on this exact pool over the last 7 days.",
  "Avg loss (7d)":
    "Average USD value extracted per sandwich on this pool over the last 7 days.",
  "Pool risk score":
    "Internal 0–1 score combining loss volume + recency. Recomputed hourly.",
  "Trade size (USD)":
    "Your input amount converted to USD using the input mint's market price.",
  "Estimated MEV risk":
    "Rough USD you might lose to sandwiching: trade size × (price impact + 2 × avg loss bps).",
  Pool: "Address of the AMM pool Jupiter routed through.",
};

const VERDICT_HELP: Record<SimulateVerdict, string> = {
  PROCEED:
    "We've seen no sandwich activity on this pool in the last 7 days. Routing as-is should be safe.",
  PROCEED_WITH_CAUTION:
    "Some sandwich history exists on this pool but the estimated risk on a trade your size is small. Proceed if the impact is acceptable.",
  USE_MEV_PROTECTED_ROUTE:
    "This pool is actively sandwiched and your trade is large enough to be a target. Use Jito or another MEV-protected route, or split the order.",
};

export function SimulatorClient() {
  const { publicKey, connected } = useWallet();
  const sim = useSimulate();

  const [wallet, setWallet] = useState("");
  const [inputMint, setInputMint] = useState(DEFAULT_INPUT.mint);
  const [outputMint, setOutputMint] = useState(DEFAULT_OUTPUT.mint);
  const [humanAmount, setHumanAmount] = useState(SAMPLE_AMOUNT);

  const inputInfo = getMintInfo(inputMint);
  const outputInfo = getMintInfo(outputMint);

  const effectiveWallet =
    wallet.trim() || (connected && publicKey ? publicKey.toBase58() : "");

  const atomicAmount = useMemo(() => {
    if (!inputInfo) return humanAmount.trim();
    return toAtomicAmount(humanAmount, inputInfo.decimals) ?? "";
  }, [humanAmount, inputInfo]);

  const expectedOutHuman = useMemo(() => {
    if (!sim.data) return null;
    if (!outputInfo) return sim.data.expectedOut;
    return `${fromAtomicAmount(sim.data.expectedOut, outputInfo.decimals)} ${outputInfo.symbol}`;
  }, [sim.data, outputInfo]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!effectiveWallet || !inputMint || !outputMint || !atomicAmount) return;
    sim.mutate({
      wallet: effectiveWallet,
      inputMint: inputMint.trim(),
      outputMint: outputMint.trim(),
      amount: atomicAmount,
    });
  };

  const fillSample = () => {
    setInputMint(DEFAULT_INPUT.mint);
    setOutputMint(DEFAULT_OUTPUT.mint);
    setHumanAmount(SAMPLE_AMOUNT);
  };

  const swap = () => {
    setInputMint(outputMint);
    setOutputMint(inputMint);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-label">Quote a swap</p>
        <button
          type="button"
          onClick={fillSample}
          style={{
            background: "transparent",
            border: "1px solid var(--border-subtle)",
            borderRadius: 4,
            padding: "6px 12px",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.08em",
            color: "var(--text-secondary)",
            cursor: "pointer",
          }}
        >
          Try sample (1 SOL → USDC)
        </button>
      </div>

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

        <div className="mt-4">
          <MintField
            label="From"
            value={inputMint}
            onChange={setInputMint}
            info={inputInfo}
          />
        </div>

        <div className="flex justify-center my-2">
          <button
            type="button"
            onClick={swap}
            aria-label="Swap input and output mints"
            style={{
              background: "var(--bg-overlay)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 999,
              width: 28,
              height: 28,
              fontFamily: "var(--font-mono)",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            ↓
          </button>
        </div>

        <MintField
          label="To"
          value={outputMint}
          onChange={setOutputMint}
          info={outputInfo}
        />

        <div className="mt-4">
          <Field
            label={`Amount${inputInfo ? ` (${inputInfo.symbol})` : ""}`}
            hint={
              inputInfo
                ? `Type the amount in ${inputInfo.symbol}. We'll convert to ${inputInfo.decimals}-decimal atomic units.`
                : "Custom mint — enter raw atomic units."
            }
          >
            <input
              value={humanAmount}
              onChange={(e) => {
                const v = e.target.value;
                if (inputInfo) {
                  if (/^\d*\.?\d*$/.test(v)) setHumanAmount(v);
                } else {
                  if (/^\d*$/.test(v)) setHumanAmount(v);
                }
              }}
              inputMode="decimal"
              placeholder={inputInfo ? "1.0" : "1000000000"}
              style={inputStyle}
            />
            {inputInfo && atomicAmount && (
              <span
                className="block mt-1"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--text-tertiary)",
                }}
              >
                = {atomicAmount} atomic units
              </span>
            )}
          </Field>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="submit"
            disabled={sim.isPending || !effectiveWallet || !atomicAmount}
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
              opacity:
                sim.isPending || !effectiveWallet || !atomicAmount ? 0.6 : 1,
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
              lineHeight: 1.5,
            }}
          >
            {humanError(sim.error)}
          </p>
        )}
      </form>

      {sim.data && (
        <Result data={sim.data} expectedOutHuman={expectedOutHuman} />
      )}
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

function MintField({
  label,
  value,
  onChange,
  info,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  info?: MintInfo;
}) {
  return (
    <div>
      <Field
        label={label}
        hint={info ? `${info.symbol} · ${info.decimals} decimals` : "Custom mint"}
      >
        <select
          value={KNOWN_MINTS.some((m) => m.mint === value) ? value : "__custom"}
          onChange={(e) => {
            if (e.target.value === "__custom") return;
            onChange(e.target.value);
          }}
          style={{
            ...inputStyle,
            appearance: "none",
            WebkitAppearance: "none",
            backgroundImage:
              "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"6\" viewBox=\"0 0 10 6\"><path d=\"M1 1l4 4 4-4\" fill=\"none\" stroke=\"%23888\" stroke-width=\"1.5\"/></svg>')",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 12px center",
            paddingRight: 32,
            cursor: "pointer",
          }}
        >
          {KNOWN_MINTS.map((m) => (
            <option key={m.mint} value={m.mint}>
              {m.symbol} ({truncate(m.mint)})
            </option>
          ))}
          <option value="__custom">Custom mint…</option>
        </select>
      </Field>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Or paste any mint address"
        spellCheck={false}
        autoComplete="off"
        style={{ ...inputStyle, marginTop: 6 }}
      />
    </div>
  );
}

function Result({
  data,
  expectedOutHuman,
}: {
  data: SimulateResponse;
  expectedOutHuman: string | null;
}) {
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
      <header className="flex items-start justify-between mb-2 flex-wrap gap-3">
        <p className="text-label">Result</p>
        <VerdictBadge verdict={data.recommendation} />
      </header>

      <p
        className="mt-2 mb-6"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 14,
          color: "var(--text-secondary)",
          lineHeight: 1.5,
        }}
      >
        {VERDICT_HELP[data.recommendation]}
      </p>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Expected out"
          value={expectedOutHuman ?? data.expectedOut}
        />
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
    <div title={KPI_HELP[label] ?? undefined}>
      <p className="text-label" style={{ marginBottom: 4 }}>
        {label}
      </p>
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 18,
          fontWeight: 500,
          color: color === "threat" ? "var(--threat-red)" : "var(--text-primary)",
          wordBreak: "break-all",
        }}
      >
        {value}
      </p>
      {KPI_HELP[label] && (
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--text-tertiary)",
            lineHeight: 1.4,
            marginTop: 4,
          }}
        >
          {KPI_HELP[label]}
        </p>
      )}
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

function humanError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "JUPITER_UNAVAILABLE") {
      return "Jupiter couldn't quote this swap. Common causes: wrong mint address, no liquidity route between the pair, or zero/too-large amount.";
    }
    if (err.code === "SIM_TIMEOUT") {
      return "Jupiter took too long to respond. Try again.";
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

function truncate(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
