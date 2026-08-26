import type { Sandwich, ThreatLevel } from "@get-toasted/ui/types";
import type { SandwichRow, WalletSummary } from "../../lib/api/types";

export interface DashboardData {
  sandwiches: Sandwich[];
  totalLossUsd: number;
  attacksFound: number;
  worstAttacker: { address: string; name: string; count: number } | null;
  riskLevel: ThreatLevel;
  transactionsAnalyzed: number;
  referenceNow: number;
  lastScanAt: string | null;
}

export function attackerDisplayName(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function pairLabel(inputMint: string, outputMint: string): string {
  return `${truncateMint(inputMint)}/${truncateMint(outputMint)}`;
}

function truncateMint(mint: string): string {
  if (mint.length <= 8) return mint;
  return `${mint.slice(0, 4)}…`;
}

export function rowToSandwich(row: SandwichRow): Sandwich {
  const confidence = Number(row.confidence);
  return {
    id: row.id,
    detectedAt: row.blockTime,
    pool: row.dex,
    pair: pairLabel(row.inputMint, row.outputMint),
    lossUsd: row.lossUsd ? parseFloat(row.lossUsd) : null,
    lossOutputAmount: row.lossOutputAmount,
    detectionLayer: row.detectionLayer,
    lossMethod: row.lossMethod,
    lossConfidence: row.lossConfidence ? parseFloat(row.lossConfidence) : null,
    confidence: Number.isFinite(confidence) ? confidence : null,
    jitoBundled: row.jitoBundled,
    failed: row.failed,
    isKnownBot: row.isKnownBot,
    knownBotName: row.knownBotName,
    attacker: row.attacker,
    validator: row.validatorVote ?? undefined,
    txSignature: row.victimSig,
    slot: Number(row.slot),
    // Full evidence chain for the bracket reconstruction
    frontSig: row.frontSig,
    backSig: row.backSig,
    dex: row.dex,
    poolAddress: row.pool,
    inputMint: row.inputMint,
    outputMint: row.outputMint,
    victimInAmt: row.victimInAmt,
    victimOutAmt: row.victimOutAmt,
    attackerProfitRaw: row.attackerProfitRaw,
    jitoTipLamports: row.jitoTipLamports,
  };
}

export function buildDashboardData(
  summary: WalletSummary,
  rows: SandwichRow[],
): DashboardData {
  const sandwiches = rows.map(rowToSandwich);
  const totalLossUsd = parseFloat(summary.totalLossUsd) || 0;
  const attacksFound = summary.sandwichCount;
  const transactionsAnalyzed = summary.totalTxCount ?? 0;

  const knownNames = new Map<string, string>();
  for (const r of rows) {
    if (r.knownBotName && !knownNames.has(r.attacker)) {
      knownNames.set(r.attacker, r.knownBotName);
    }
  }

  const counts = new Map<string, number>();
  for (const s of sandwiches) {
    counts.set(s.attacker, (counts.get(s.attacker) ?? 0) + 1);
  }
  const worstEntry = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const worstAttacker = worstEntry
    ? {
        address: worstEntry[0],
        name: knownNames.get(worstEntry[0]) ?? attackerDisplayName(worstEntry[0]),
        count: worstEntry[1],
      }
    : null;

  let riskLevel: ThreatLevel;
  if (attacksFound === 0) riskLevel = "none";
  else if (attacksFound >= 8 || totalLossUsd > 100) riskLevel = "high";
  else if (attacksFound >= 3 || totalLossUsd > 25) riskLevel = "medium";
  else riskLevel = "low";

  const referenceNow = Date.now();

  return {
    sandwiches,
    totalLossUsd,
    attacksFound,
    worstAttacker,
    riskLevel,
    transactionsAnalyzed,
    referenceNow,
    lastScanAt: summary.lastScanAt ?? null,
  };
}
