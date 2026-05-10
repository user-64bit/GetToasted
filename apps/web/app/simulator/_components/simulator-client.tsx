"use client";

import { useMemo, useState, type FormEvent } from "react";
import { RiskMeter } from "@get-toasted/ui/risk-meter";
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
const SAMPLE_WALLET = "8UE2QGDJcpBp1PPjuCz3EsDtJn3wzSaPsmpVYXGRbzC7";

const VERDICT: Record<
  SimulateVerdict | "IDLE" | "LOADING" | "ERROR",
  { label: string; title: string; body: string; tone: "safe" | "amber" | "threat" | "muted" }
> = {
  IDLE: {
    label: "Awaiting quote",
    title: "Enter a route to classify risk.",
    body: "The verdict will update after Jupiter returns a pool route and GetToasted checks recent sandwich activity.",
    tone: "muted",
  },
  LOADING: {
    label: "Simulating",
    title: "Computing route exposure.",
    body: "Fetching quote, pool, recent detections, and estimated MEV exposure.",
    tone: "amber",
  },
  ERROR: {
    label: "Quote failed",
    title: "The route could not be simulated.",
    body: "Check the wallet, mint addresses, and amount, then try again.",
    tone: "threat",
  },
  PROCEED: {
    label: "Proceed",
    title: "No recent sandwich pressure on this pool.",
    body: "The route has no detected sandwiches in the 7-day pool window. Still review slippage before signing.",
    tone: "safe",
  },
  PROCEED_WITH_CAUTION: {
    label: "Caution",
    title: "Some sandwich history exists.",
    body: "The pool has recent detections or measurable route impact. Consider splitting size or tightening execution.",
    tone: "amber",
  },
  USE_MEV_PROTECTED_ROUTE: {
    label: "Use protected route",
    title: "This route is exposed.",
    body: "Recent pool activity and trade size cross the risk threshold. Use protected execution or split the order.",
    tone: "threat",
  },
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
    setWallet(SAMPLE_WALLET);
    setInputMint(DEFAULT_INPUT.mint);
    setOutputMint(DEFAULT_OUTPUT.mint);
    setHumanAmount(SAMPLE_AMOUNT);
  };

  const swap = () => {
    setInputMint(outputMint);
    setOutputMint(inputMint);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)] lg:items-start">
      <section
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-panel)",
          overflow: "hidden",
        }}
      >
        <header
          className="flex items-center justify-between gap-3"
          style={{
            padding: "14px 16px",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <p className="text-label">Trade input</p>
          <button type="button" onClick={fillSample} style={miniButtonStyle}>
            Use demo route
          </button>
        </header>

        <form onSubmit={onSubmit} style={{ padding: 18 }}>
          <Field label="Wallet" hint="Paste any Solana address. Connected wallet fills this automatically.">
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

          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
            <MintField label="From" value={inputMint} onChange={setInputMint} info={inputInfo} />
            <button
              type="button"
              onClick={swap}
              aria-label="Swap input and output mints"
              className="mt-0 sm:mt-8"
              style={miniIconButtonStyle}
            >
              v
            </button>
            <MintField label="To" value={outputMint} onChange={setOutputMint} info={outputInfo} />
          </div>

          <div className="mt-4">
            <Field
              label={`Amount${inputInfo ? ` (${inputInfo.symbol})` : ""}`}
              hint={
                inputInfo
                  ? `${atomicAmount || "0"} atomic units`
                  : "Custom mint: enter raw atomic units."
              }
            >
              <input
                value={humanAmount}
                onChange={(e) => {
                  const v = e.target.value;
                  if (inputInfo) {
                    if (/^\d*\.?\d*$/.test(v)) setHumanAmount(v);
                  } else if (/^\d*$/.test(v)) {
                    setHumanAmount(v);
                  }
                }}
                inputMode="decimal"
                placeholder={inputInfo ? "1.0" : "1000000000"}
                style={inputStyle}
              />
            </Field>
          </div>

          <button
            type="submit"
            disabled={sim.isPending || !effectiveWallet || !atomicAmount}
            className="gt-btn mt-6"
            style={{
              width: "100%",
              background: "var(--accent)",
              color: "var(--text-inverse)",
              border: "1px solid var(--accent)",
              padding: "13px 16px",
              borderRadius: "var(--radius-control)",
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              fontWeight: 600,
              opacity:
                sim.isPending || !effectiveWallet || !atomicAmount ? 0.55 : 1,
            }}
          >
            {sim.isPending ? "Simulating route..." : "Simulate swap ->"}
          </button>

          {!effectiveWallet ? (
            <p className="mt-3" style={hintStyle}>
              Wallet required before simulation.
            </p>
          ) : null}

          {sim.isError ? (
            <p className="mt-4" role="alert" style={{ ...hintStyle, color: "var(--threat-red)" }}>
              {humanError(sim.error)}
            </p>
          ) : null}
        </form>
      </section>

      <VerdictPanel
        data={sim.data}
        loading={sim.isPending}
        error={sim.isError ? humanError(sim.error) : null}
        expectedOutHuman={expectedOutHuman}
      />

    </div>
  );
}

const miniButtonStyle = {
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-control)",
  padding: "7px 10px",
  color: "var(--text-secondary)",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  background: "var(--bg-overlay)",
} as const;

const miniIconButtonStyle = {
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-control)",
  width: 34,
  height: 34,
  color: "var(--text-secondary)",
  fontFamily: "var(--font-mono)",
  background: "var(--bg-overlay)",
} as const;

const inputStyle = {
  width: "100%",
  background: "var(--bg-field)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-control)",
  padding: "10px 12px",
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  color: "var(--text-primary)",
} as const;

const hintStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  color: "var(--text-tertiary)",
  lineHeight: 1.45,
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
      <span className="text-label mb-2 block">{label}</span>
      {children}
      {hint ? (
        <span className="mt-1 block" style={hintStyle}>
          {hint}
        </span>
      ) : null}
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
      <Field label={label} hint={info ? `${info.symbol} / ${info.decimals} decimals` : "Custom mint"}>
        <select
          value={KNOWN_MINTS.some((m) => m.mint === value) ? value : "__custom"}
          onChange={(e) => {
            if (e.target.value !== "__custom") onChange(e.target.value);
          }}
          style={{
            ...inputStyle,
            appearance: "none",
            WebkitAppearance: "none",
            cursor: "pointer",
          }}
        >
          {KNOWN_MINTS.map((m) => (
            <option key={m.mint} value={m.mint}>
              {m.symbol} ({truncate(m.mint)})
            </option>
          ))}
          <option value="__custom">Custom mint</option>
        </select>
      </Field>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Mint address"
        spellCheck={false}
        autoComplete="off"
        style={{ ...inputStyle, marginTop: 6 }}
      />
    </div>
  );
}

function VerdictPanel({
  data,
  loading,
  error,
  expectedOutHuman,
}: {
  data?: SimulateResponse;
  loading: boolean;
  error: string | null;
  expectedOutHuman: string | null;
}) {
  const key = error ? "ERROR" : loading ? "LOADING" : data?.recommendation ?? "IDLE";
  const verdict = VERDICT[key];
  const riskScore = data?.poolRiskScore ?? (key === "USE_MEV_PROTECTED_ROUTE" ? 0.82 : key === "PROCEED_WITH_CAUTION" ? 0.48 : 0);
  const isHigh = key === "USE_MEV_PROTECTED_ROUTE";

  return (
    <section
      style={{
        background: "var(--bg-surface)",
        border: `1px solid ${
          verdict.tone === "threat"
            ? "var(--threat-red-border)"
            : verdict.tone === "amber"
              ? "var(--threat-amber-border)"
              : "var(--border-subtle)"
        }`,
        borderRadius: "var(--radius-panel)",
        overflow: "hidden",
      }}
    >
      <header style={{ padding: 18, borderBottom: "1px solid var(--border-subtle)" }}>
        <span
          style={{
            display: "inline-flex",
            border: `1px solid ${toneBorder(verdict.tone)}`,
            background: toneBg(verdict.tone),
            color: toneColor(verdict.tone),
            borderRadius: "var(--radius-chip)",
            padding: "4px 7px",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            textTransform: "uppercase",
          }}
        >
          {verdict.label}
        </span>
        <h2 className="text-h1 mt-4">{verdict.title}</h2>
        <p
          className="mt-3"
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 15,
            lineHeight: 1.55,
            color: "var(--text-secondary)",
          }}
        >
          {error ?? verdict.body}
        </p>
      </header>

      <div style={{ padding: 18 }}>
        <RiskMeter
          score={Math.max(0, Math.min(1, riskScore ?? 0))}
          label="Pool risk score"
        />

        <div
          className="mt-6 grid gap-px sm:grid-cols-2"
          style={{
            background: "var(--border-subtle)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-panel)",
            overflow: "hidden",
          }}
        >
          <Stat label="Expected out" value={expectedOutHuman ?? data?.expectedOut ?? "--"} />
          <Stat label="Price impact" value={data ? `${data.priceImpactPct.toFixed(4)}%` : "--"} />
          <Stat label="Sandwiches 7d" value={data?.sandwichCount7d ?? "--"} tone={data && data.sandwichCount7d > 0 ? "threat" : undefined} />
          <Stat label="Avg loss 7d" value={data?.avgLossUsd7d ? `$${data.avgLossUsd7d}` : "--"} />
          <Stat label="Trade size" value={data?.amountUsd !== null && data?.amountUsd !== undefined ? `$${data.amountUsd.toFixed(2)}` : "--"} />
          <Stat label="Estimated MEV risk" value={data?.estimatedMevRiskUsd !== null && data?.estimatedMevRiskUsd !== undefined ? `$${data.estimatedMevRiskUsd.toFixed(2)}` : "--"} tone="threat" />
          <Stat label="Pool" value={data?.pool ? truncate(data.pool) : "--"} wide />
        </div>

        {isHigh ? (
          <button
            type="button"
            className="gt-btn mt-6"
            style={{
              width: "100%",
              background: "var(--threat-red)",
              color: "var(--text-inverse)",
              border: "1px solid var(--threat-red-border)",
              borderRadius: "var(--radius-control)",
              padding: "14px 16px",
              fontFamily: "var(--font-mono)",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            Execute with Jito Protection -&gt;
          </button>
        ) : null}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
  wide,
}: {
  label: string;
  value: string | number;
  tone?: "threat";
  wide?: boolean;
}) {
  return (
    <div
      className={wide ? "sm:col-span-2" : undefined}
      style={{
        background: "var(--bg-base)",
        padding: 14,
      }}
    >
      <p className="text-label">{label}</p>
      <p
        className="mt-2"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 18,
          color: tone === "threat" ? "var(--threat-red)" : "var(--text-primary)",
          wordBreak: "break-all",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function toneColor(tone: "safe" | "amber" | "threat" | "muted") {
  if (tone === "safe") return "var(--safe-green)";
  if (tone === "amber") return "var(--threat-amber)";
  if (tone === "threat") return "var(--threat-red)";
  return "var(--text-secondary)";
}

function toneBg(tone: "safe" | "amber" | "threat" | "muted") {
  if (tone === "safe") return "var(--safe-green-dim)";
  if (tone === "amber") return "var(--threat-amber-dim)";
  if (tone === "threat") return "var(--threat-red-dim)";
  return "var(--bg-elevated)";
}

function toneBorder(tone: "safe" | "amber" | "threat" | "muted") {
  if (tone === "safe") return "var(--safe-green-border)";
  if (tone === "amber") return "var(--threat-amber-border)";
  if (tone === "threat") return "var(--threat-red-border)";
  return "var(--border-default)";
}

function humanError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "JUPITER_UNAVAILABLE") {
      return "Jupiter could not quote this swap. Check mint addresses, liquidity, and amount.";
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
