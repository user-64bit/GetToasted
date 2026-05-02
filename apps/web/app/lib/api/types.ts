export type ScanStatus =
  | "unknown"
  | "pending"
  | "scanning"
  | "complete"
  | "failed";

export interface ScanProgress {
  signaturesProcessed: number;
  sandwichesFound: number;
  cursor: string | null;
  progressPct: number;
}

export interface WalletSummary {
  address: string;
  scanStatus: ScanStatus;
  sandwichCount: number;
  totalLossUsd: string;
  firstAttackAt: string | null;
  lastAttackAt: string | null;
  scanProgress: ScanProgress | null;
  scanError: string | null;
  firstSeenAt?: string | null;
  lastScanAt?: string | null;
  totalTxCount?: number;
}

export interface SandwichRow {
  id: string;
  slot: string;
  blockTime: string;
  pool: string;
  dex: string;
  attacker: string;
  victimWallet: string;
  validatorVote: string | null;
  frontSig: string;
  victimSig: string;
  backSig: string;
  jitoBundled: boolean;
  jitoTipLamports: string | null;
  inputMint: string;
  outputMint: string;
  victimInAmt: string;
  victimOutAmt: string;
  attackerProfitRaw: string;
  lossUsd: string | null;
  confidence: number;
  failed: boolean;
  isKnownBot: boolean;
  knownBotName: string | null;
  detectedAt: string;
}

export interface SandwichesPage {
  data: SandwichRow[];
  nextCursor: string | null;
}

export interface SandwichesQuery {
  limit?: number;
  cursor?: string;
  fromDate?: string;
  toDate?: string;
  dex?: string;
  minLossUsd?: number;
}

export interface ScanStartResponse {
  scanId: string;
  status: "queued";
  estimatedDurationSeconds: number;
}

export interface MeResponse {
  authenticated: boolean;
  address?: string;
  expiresAt?: string | null;
}

export type SimulateVerdict =
  | "PROCEED"
  | "PROCEED_WITH_CAUTION"
  | "USE_MEV_PROTECTED_ROUTE";

export interface SimulateRequest {
  wallet: string;
  inputMint: string;
  outputMint: string;
  amount: string;
}

export interface SimulateResponse {
  expectedOut: string;
  priceImpactPct: number;
  pool: string | null;
  poolRiskScore: number | null;
  sandwichCount7d: number;
  avgLossUsd7d: string | null;
  tokenPriceUsd: number | null;
  amountUsd: number | null;
  estimatedMevRiskUsd: number | null;
  recommendation: SimulateVerdict;
}
