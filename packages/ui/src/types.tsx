export type ThreatLevel = "high" | "medium" | "low" | "none";

export type Sandwich = {
  id: string;
  detectedAt: Date | string;
  pool: string;
  pair: string;
  lossUsd: number;
  attacker: string;
  validator?: string;
  txSignature: string;
  slot: number;
};
