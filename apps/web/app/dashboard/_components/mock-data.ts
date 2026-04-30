import type { Sandwich, ThreatLevel } from "@get-toasted/ui/types";

const POOLS = ["Raydium", "Orca", "Meteora", "Phoenix", "Lifinity"];
const PAIRS = [
  "SOL/USDC",
  "BONK/SOL",
  "SOL/USDT",
  "JTO/USDC",
  "WIF/SOL",
  "PYTH/USDC",
  "JUP/SOL",
];

// Fictional placeholder pubkeys + their friendly names. Replaced once the
// real detector pipeline confirms attacker identities.
const ATTACKERS = [
  "ArscACTiveMockSandwichBoTPubKey1111111111111",
  "ArscColdMockSandwichBoTPubKey22222222222222",
  "ArscWarmMockSandwichBoTPubKey33333333333333",
  "DeezMockSandwichBoTPubKey44444444444444444",
];

const ATTACKER_NAMES: Record<string, string> = {
  [ATTACKERS[0] as string]: "arsc-active",
  [ATTACKERS[1] as string]: "arsc-cold",
  [ATTACKERS[2] as string]: "arsc-warm",
  [ATTACKERS[3] as string]: "DeezNode",
};

const VALIDATORS = ["DeezNode", "Helius", "Triton One", "Jito Validator"];

export interface DashboardMock {
  sandwiches: Sandwich[];
  totalLossUsd: number;
  attacksFound: number;
  worstAttacker: { address: string; name: string; count: number } | null;
  riskLevel: ThreatLevel;
  series: { month: string; loss: number }[];
  transactionsAnalyzed: number;
  // Server-stable timestamp anchor; passed to the client so date-range
  // filters don't have to call Date.now() during render.
  referenceNow: number;
}

export interface MockOptions {
  force?: "clean" | "auto";
}

export function mockDashboard(
  wallet: string,
  opts: MockOptions = {},
): DashboardMock {
  const seed = hashString(wallet);
  const rng = mulberry32(seed);

  const transactionsAnalyzed = 800 + Math.floor(rng() * 4500);

  const count = opts.force === "clean" ? 0 : 3 + Math.floor(rng() * 12);

  // Anchor the time range to the start of today (server-stable across requests
  // within the same day, avoids hydration mismatches versus Date.now()).
  const anchor = new Date();
  anchor.setHours(0, 0, 0, 0);
  const anchorMs = anchor.getTime();
  const yearMs = 365 * 86_400_000;

  const sandwiches: Sandwich[] = [];
  for (let i = 0; i < count; i++) {
    const detectedAt = new Date(anchorMs - Math.floor(rng() * yearMs));
    sandwiches.push({
      id: `${wallet.slice(0, 8)}-${i}`,
      detectedAt,
      pool: pickRng(POOLS, rng),
      pair: pickRng(PAIRS, rng),
      lossUsd: skewedLoss(rng),
      attacker: pickRng(ATTACKERS, rng),
      validator: pickRng(VALIDATORS, rng),
      txSignature: deterministicSig(wallet, i, rng),
      slot: 280_000_000 + Math.floor(rng() * 30_000_000),
    });
  }

  sandwiches.sort(
    (a, b) =>
      new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
  );

  const totalLossUsd =
    Math.round(sandwiches.reduce((s, x) => s + x.lossUsd, 0) * 100) / 100;

  const counts = new Map<string, number>();
  for (const s of sandwiches) {
    counts.set(s.attacker, (counts.get(s.attacker) ?? 0) + 1);
  }
  const worstEntry = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const worstAttacker = worstEntry
    ? {
        address: worstEntry[0],
        name: ATTACKER_NAMES[worstEntry[0]] ?? truncate(worstEntry[0]),
        count: worstEntry[1],
      }
    : null;

  let riskLevel: ThreatLevel;
  if (count === 0) riskLevel = "none";
  else if (count >= 8 || totalLossUsd > 100) riskLevel = "high";
  else if (count >= 3 || totalLossUsd > 25) riskLevel = "medium";
  else riskLevel = "low";

  const series = buildMonthlySeries(sandwiches, 12, anchor);

  return {
    sandwiches,
    totalLossUsd,
    attacksFound: count,
    worstAttacker,
    riskLevel,
    series,
    transactionsAnalyzed,
    referenceNow: anchorMs,
  };
}

export function attackerDisplayName(address: string): string {
  return ATTACKER_NAMES[address] ?? truncate(address);
}

// --- helpers ---------------------------------------------------------------

function hashString(s: string): number {
  let h = 2_166_136_261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16_777_619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pickRng<T>(xs: T[], rng: () => number): T {
  return xs[Math.floor(rng() * xs.length)] as T;
}

function skewedLoss(rng: () => number): number {
  const r = rng();
  let cents: number;
  if (r < 0.7) cents = Math.floor(rng() * 500); // $0–$5
  else if (r < 0.95) cents = 500 + Math.floor(rng() * 5000); // $5–$55
  else cents = 5000 + Math.floor(rng() * 45000); // $50–$500
  return Math.round(cents) / 100;
}

function deterministicSig(wallet: string, i: number, rng: () => number): string {
  const head = wallet.slice(0, 4);
  const rand = Math.floor(rng() * 1_000_000_000).toString(36);
  return `${head}${rand}sig${i}`;
}

function truncate(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function buildMonthlySeries(
  sandwiches: Sandwich[],
  months: number,
  anchor: Date,
): { month: string; loss: number }[] {
  const buckets: { key: string; month: string; loss: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(anchor);
    d.setMonth(d.getMonth() - i);
    buckets.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      month: d.toLocaleDateString("en-US", { month: "short" }),
      loss: 0,
    });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));

  for (const s of sandwiches) {
    const d = new Date(s.detectedAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const bucket = byKey.get(key);
    if (bucket) bucket.loss += s.lossUsd;
  }

  return buckets.map((b) => ({
    month: b.month,
    loss: Math.round(b.loss * 100) / 100,
  }));
}
