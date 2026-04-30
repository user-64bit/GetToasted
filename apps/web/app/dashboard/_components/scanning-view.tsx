"use client";

import { ScanProgress } from "@get-toasted/ui/scan-progress";
import { SandwichCard } from "@get-toasted/ui/sandwich-card";
import type { Sandwich } from "@get-toasted/ui/types";
import { useEffect, useRef, useState } from "react";

const POOLS = ["Raydium", "Orca", "Meteora", "Phoenix"];
const PAIRS = ["SOL/USDC", "BONK/SOL", "SOL/USDT", "JTO/USDC", "WIF/SOL", "PYTH/USDC"];
// Fictional placeholder pubkeys for the mocked scan stream — replaced once
// the real BullMQ-backed SSE is wired into apps/api.
const ATTACKERS = [
  "ArscACTiveMockSandwichBoTPubKey1111111111111",
  "ArscColdMockSandwichBoTPubKey22222222222222",
  "ArscWarmMockSandwichBoTPubKey33333333333333",
  "DeezMockSandwichBoTPubKey44444444444444444",
];

const SCAN_DURATION_MS = 24_000;
const TICK_MS = 200;

function pick<T>(xs: T[]): T {
  return xs[Math.floor(Math.random() * xs.length)] as T;
}

function mockSandwich(seq: number): Sandwich {
  return {
    id: `mock-${seq}-${Date.now()}`,
    detectedAt: new Date(
      Date.now() - Math.floor(Math.random() * 365 * 86_400_000),
    ),
    pool: pick(POOLS),
    pair: pick(PAIRS),
    lossUsd: Math.round(Math.random() * 20_000) / 100,
    attacker: pick(ATTACKERS),
    txSignature: `mock-sig-${seq}`,
    slot: 280_000_000 + Math.floor(Math.random() * 30_000_000),
  };
}

function shortAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

export function ScanningView({ wallet }: { wallet: string }) {
  const [progress, setProgress] = useState(0);
  const [transactionsAnalyzed, setTransactionsAnalyzed] = useState(0);
  const [sandwiches, setSandwiches] = useState<Sandwich[]>([]);

  const seqRef = useRef(0);
  const startRef = useRef(0);
  const totalTxRef = useRef(0);
  const nextDetectionAtRef = useRef(0);

  useEffect(() => {
    startRef.current = Date.now();
    totalTxRef.current = 1500 + Math.floor(Math.random() * 2000);
    nextDetectionAtRef.current = 1500 + Math.random() * 3500;

    const intervalId = window.setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const p = Math.min(100, (elapsed / SCAN_DURATION_MS) * 100);
      setProgress(p);
      setTransactionsAnalyzed(Math.floor((p / 100) * totalTxRef.current));

      if (elapsed >= nextDetectionAtRef.current && p < 100) {
        const sw = mockSandwich(seqRef.current++);
        setSandwiches((prev) => [sw, ...prev]);
        nextDetectionAtRef.current = elapsed + 1800 + Math.random() * 4500;
      }

      if (p >= 100) window.clearInterval(intervalId);
    }, TICK_MS);

    return () => window.clearInterval(intervalId);
  }, []);

  const isComplete = progress >= 100;

  return (
    <div className="px-6 py-24" style={{ minHeight: "100vh" }}>
      <div className="max-w-3xl mx-auto">
        <ScanProgress
          progress={progress}
          sandwichesFound={sandwiches.length}
          transactionsAnalyzed={transactionsAnalyzed}
          walletAddress={shortAddress(wallet)}
        />

        {sandwiches.length > 0 && (
          <div className="mt-16">
            <p className="text-label" style={{ marginBottom: 16 }}>
              Detected · {sandwiches.length}
            </p>
            <div className="flex flex-col gap-3">
              {sandwiches.map((s) => (
                <SandwichCard key={s.id} sandwich={s} isNew />
              ))}
            </div>
          </div>
        )}

        {isComplete && (
          <div
            className="mt-16 text-center"
            style={{
              padding: 32,
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderTop: "2px solid var(--threat-red-border)",
              borderRadius: 8,
            }}
          >
            <p className="text-label">Scan complete</p>
            <p className="text-h2 mt-2">
              {sandwiches.length} attacks ·{" "}
              {transactionsAnalyzed.toLocaleString("en-US")} transactions
            </p>
            <p
              className="mt-2"
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 13,
                color: "var(--text-secondary)",
              }}
            >
              Full dashboard view (KPIs, chart, table) arrives in the next step.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
