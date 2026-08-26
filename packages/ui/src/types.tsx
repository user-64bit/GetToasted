export type ThreatLevel = "high" | "medium" | "low" | "none";

export type DetectionLayer = "L1" | "L2" | "L3" | "L4" | "L5" | "legacy" | string;

export type Sandwich = {
  id: string;
  detectedAt: Date | string;
  pool: string;
  pair: string;
  lossUsd: number | null;
  lossOutputAmount?: string | null;
  detectionLayer?: DetectionLayer;
  lossMethod?: string | null;
  lossConfidence?: number | null;
  confidence?: number | null;
  jitoBundled?: boolean;
  failed?: boolean;
  isKnownBot?: boolean;
  knownBotName?: string | null;
  attacker: string;
  validator?: string;
  txSignature: string;
  slot: number;
  /* Full evidence chain — populated from the API row so the three-leg
     bracket can be reconstructed and each leg linked on-chain. */
  frontSig?: string;
  backSig?: string;
  dex?: string;
  poolAddress?: string;
  inputMint?: string;
  outputMint?: string;
  victimInAmt?: string;
  victimOutAmt?: string;
  attackerProfitRaw?: string | null;
  jitoTipLamports?: string | null;
};
