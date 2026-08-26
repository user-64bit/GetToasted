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

type Tone = "safe" | "amber" | "threat" | "muted";

const VERDICT: Record<
  SimulateVerdict | "IDLE" | "LOADING" | "ERROR",
  { label: string; title: React.ReactNode; body: string; tone: Tone }
> = {
  IDLE: {
    label: "Awaiting quote",
    title: <>Enter a route to <em>classify</em> the risk.</>,
    body: "The verdict updates once Jupiter returns a pool route and GetToasted checks recent sandwich activity.",
    tone: "muted",
  },
  LOADING: {
    label: "Simulating",
    title: <>Computing route <em>exposure.</em></>,
    body: "Fetching the quote, pool, recent detections and estimated MEV exposure.",
    tone: "amber",
  },
  ERROR: {
    label: "Quote failed",
    title: <>The route could not be <em>simulated.</em></>,
    body: "Check the wallet, mint addresses and amount, then try again.",
    tone: "threat",
  },
  PROCEED: {
    label: "Proceed",
    title: <>The pool is <em>quiet.</em></>,
    body: "No sandwiches detected in this pool's 7-day window. Still review slippage before signing.",
    tone: "safe",
  },
  PROCEED_WITH_CAUTION: {
    label: "Caution",
    title: <>Some sandwich <em>history</em> here.</>,
    body: "The pool has recent detections or measurable route impact. Consider splitting the size or tightening execution.",
    tone: "amber",
  },
  USE_MEV_PROTECTED_ROUTE: {
    label: "Use a protected route",
    title: <>This route is <em>exposed.</em></>,
    body: "Recent pool activity and trade size cross the risk threshold. Route through MEV-protected execution or split the order.",
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
    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(400px,1.1fr)] lg:items-start">
      <section className="panel" style={{ overflow: "hidden" }}>
        <div className="panel-hd">
          <p className="text-label">Trade input</p>
          <button type="button" onClick={fillSample} className="btn btn-ghost btn-sm">
            Use demo route
          </button>
        </div>

        <form onSubmit={onSubmit} className="panel-bd">
          <Field label="Wallet" hint="Any Solana address. A connected wallet fills this automatically.">
            <input
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              placeholder={connected && publicKey ? publicKey.toBase58() : "Solana address"}
              spellCheck={false}
              autoComplete="off"
              className="field-input"
            />
          </Field>

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
            <MintField label="From" value={inputMint} onChange={setInputMint} info={inputInfo} />
            <button
              type="button"
              onClick={swap}
              aria-label="Swap input and output mints"
              className="btn btn-outline sm:mt-7"
              style={{ width: 38, height: 38, padding: 0 }}
            >
              ⇅
            </button>
            <MintField label="To" value={outputMint} onChange={setOutputMint} info={outputInfo} />
          </div>

          <div className="mt-4">
            <Field
              label={`Amount${inputInfo ? ` · ${inputInfo.symbol}` : ""}`}
              hint={inputInfo ? `${atomicAmount || "0"} atomic units` : "Custom mint: enter raw atomic units."}
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
                className="field-input"
              />
            </Field>
          </div>

          <button
            type="submit"
            disabled={sim.isPending || !effectiveWallet || !atomicAmount}
            className="btn btn-accent btn-lg mt-6"
            style={{ width: "100%" }}
          >
            {sim.isPending ? "Simulating route…" : "Simulate swap →"}
          </button>

          {!effectiveWallet ? (
            <p className="field-hint" style={{ marginTop: 12 }}>
              A wallet is required before simulation.
            </p>
          ) : null}

          {sim.isError ? (
            <p className="field-hint" role="alert" style={{ marginTop: 14, color: "var(--threat-red)" }}>
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
        inputMint={inputMint}
        outputMint={outputMint}
      />
    </div>
  );
}

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
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
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
      <Field label={label} hint={info ? `${info.symbol} · ${info.decimals} decimals` : "Custom mint"}>
        <select
          value={KNOWN_MINTS.some((m) => m.mint === value) ? value : "__custom"}
          onChange={(e) => {
            if (e.target.value !== "__custom") onChange(e.target.value);
          }}
          className="field-select"
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
        className="field-input"
        style={{ marginTop: 6 }}
      />
    </div>
  );
}

function VerdictPanel({
  data,
  loading,
  error,
  expectedOutHuman,
  inputMint,
  outputMint,
}: {
  data?: SimulateResponse;
  loading: boolean;
  error: string | null;
  expectedOutHuman: string | null;
  inputMint: string;
  outputMint: string;
}) {
  const key = error ? "ERROR" : loading ? "LOADING" : (data?.recommendation ?? "IDLE");
  const verdict = VERDICT[key];
  const riskScore =
    data?.poolRiskScore ??
    (key === "USE_MEV_PROTECTED_ROUTE" ? 0.82 : key === "PROCEED_WITH_CAUTION" ? 0.48 : 0);
  const isHigh = key === "USE_MEV_PROTECTED_ROUTE";

  return (
    <section
      className="panel"
      style={{ overflow: "hidden", borderColor: toneBorder(verdict.tone) }}
    >
      <header style={{ padding: 22, borderBottom: "1px solid var(--border-subtle)" }}>
        <span
          className="chip"
          style={{
            borderColor: toneBorder(verdict.tone),
            background: toneBg(verdict.tone),
            color: toneColor(verdict.tone),
          }}
        >
          {verdict.label}
        </span>
        <h2
          className="text-h1 verdict-h1"
          style={{ marginTop: 16, color: "var(--text-primary)", ["--em-color" as string]: toneColor(verdict.tone) }}
        >
          {verdict.title}
        </h2>
        <p className="text-body-sm" style={{ marginTop: 12, maxWidth: 520 }}>
          {error ?? verdict.body}
        </p>
      </header>

      <div className="panel-bd">
        {data ? (
          <RiskMeter score={Math.max(0, Math.min(1, riskScore ?? 0))} label="Pool risk score" />
        ) : (
          <InertRiskMeter loading={loading} />
        )}

        <div
          className="mt-6 grid grid-cols-2"
          style={{
            background: "var(--border-subtle)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-panel)",
            overflow: "hidden",
            gap: 1,
          }}
        >
          <Stat label="Expected out" value={expectedOutHuman ?? data?.expectedOut ?? "—"} />
          <Stat label="Price impact" value={data ? `${data.priceImpactPct.toFixed(4)}%` : "—"} />
          <Stat
            label="Sandwiches · 7d"
            value={data?.sandwichCount7d ?? "—"}
            tone={data && data.sandwichCount7d > 0 ? "threat" : undefined}
          />
          <Stat label="Avg loss · 7d" value={data?.avgLossUsd7d ? `$${data.avgLossUsd7d}` : "—"} />
          <Stat
            label="Trade size"
            value={data?.amountUsd !== null && data?.amountUsd !== undefined ? `$${data.amountUsd.toFixed(2)}` : "—"}
          />
          <Stat
            label="Est. MEV risk"
            value={
              data?.estimatedMevRiskUsd !== null && data?.estimatedMevRiskUsd !== undefined
                ? `$${data.estimatedMevRiskUsd.toFixed(2)}`
                : "—"
            }
            tone={data && (data.estimatedMevRiskUsd ?? 0) > 0 ? "threat" : undefined}
          />
          <Stat label="Pool" value={data?.pool ? truncate(data.pool) : "—"} wide />
        </div>

        {isHigh ? <ProtectedRouteCallout inputMint={inputMint} outputMint={outputMint} /> : null}
      </div>
    </section>
  );
}

/**
 * Honest recommendation. GetToasted does not sign or send transactions, so
 * this is a labelled external link to a MEV-protected route on Jupiter — not
 * a button dressed up to look like it executes a trade.
 */
function ProtectedRouteCallout({
  inputMint,
  outputMint,
}: {
  inputMint: string;
  outputMint: string;
}) {
  const href = `https://jup.ag/swap/${encodeURIComponent(inputMint)}-${encodeURIComponent(outputMint)}`;
  return (
    <div
      className="mt-6"
      style={{
        background: "var(--bg-base)",
        border: "1px solid var(--threat-red-border)",
        borderTop: "2px solid var(--threat-red)",
        borderRadius: "var(--radius-panel)",
        padding: "18px 20px 20px",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 600,
          color: "var(--threat-red)",
          textTransform: "uppercase",
          letterSpacing: "0.16em",
          marginBottom: 12,
        }}
      >
        Recommended action
      </p>
      <h3 className="text-h2" style={{ color: "var(--text-primary)", marginBottom: 16 }}>
        Route this swap with <span style={{ color: "var(--threat-red)" }}>MEV protection.</span>
      </h3>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-danger"
        style={{ width: "100%", justifyContent: "space-between" }}
      >
        <span>Open on Jupiter · MEV-protected</span>
        <span aria-hidden>↗</span>
      </a>
      <p className="field-hint" style={{ marginTop: 12 }}>
        GetToasted never signs or sends a transaction. This opens Jupiter,
        where you can enable protected execution and review the route yourself.
      </p>
    </div>
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
    <div className={wide ? "col-span-2" : undefined} style={{ background: "var(--bg-surface)", padding: 14 }}>
      <p className="text-label">{label}</p>
      <p
        className="mt-2 tnum"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 17,
          color: tone === "threat" ? "var(--threat-red)" : "var(--text-primary)",
          wordBreak: "break-all",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function InertRiskMeter({ loading }: { loading: boolean }) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-label">Pool risk score</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-tertiary)" }}>—</span>
      </div>
      <div
        className="relative overflow-hidden"
        style={{
          height: 6,
          borderRadius: 999,
          background: "var(--bg-field)",
          border: "1px dashed var(--border-subtle)",
        }}
      >
        {loading ? (
          <div
            className="gt-scan-shimmer"
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(90deg, transparent, var(--accent-dim), transparent)",
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function toneColor(tone: Tone) {
  if (tone === "safe") return "var(--safe-green)";
  if (tone === "amber") return "var(--threat-amber)";
  if (tone === "threat") return "var(--threat-red)";
  return "var(--text-secondary)";
}
function toneBg(tone: Tone) {
  if (tone === "safe") return "var(--safe-green-dim)";
  if (tone === "amber") return "var(--threat-amber-dim)";
  if (tone === "threat") return "var(--threat-red-dim)";
  return "var(--bg-elevated)";
}
function toneBorder(tone: Tone) {
  if (tone === "safe") return "var(--safe-green-border)";
  if (tone === "amber") return "var(--threat-amber-border)";
  if (tone === "threat") return "var(--threat-red-border)";
  return "var(--border-subtle)";
}

function humanError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "JUPITER_UNAVAILABLE") {
      return "Jupiter could not quote this swap. Check the mints, liquidity and amount.";
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
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
