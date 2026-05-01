export type Dex =
  | "raydium_amm_v4"
  | "raydium_clmm"
  | "raydium_cpmm"
  | "orca_whirlpool"
  | "meteora_dlmm"
  | "meteora_damm_v2"
  | "phoenix"
  | "pumpswap"
  | "pumpfun_bonding"
  | "lifinity_v2"
  | "unknown";

export type ParsedSwap = {
  signature: string;
  slot: bigint;
  txIndexInBlock: number;
  blockTime: Date;
  signer: string;
  pool: string;
  programId: string;
  dex: Dex;
  inputMint: string;
  outputMint: string;
  inputAmount: bigint;
  outputAmount: bigint;
  jitoTipLamports: bigint | null;
  jitoBundled: boolean;
  inputDecimals: number;
  outputDecimals: number;
  failed: boolean;
};

export type SandwichCandidate = {
  front: ParsedSwap;
  victim: ParsedSwap;
  back: ParsedSwap;
  pool: string;
  slot: bigint;
};

export type SandwichDetection = {
  candidate: SandwichCandidate;
  victimLossRaw: bigint;
  attackerProfitRaw: bigint;
  lossUsd: number | null;
  confidenceScore: number;
  validatorVoteAccount: string | null;
  isKnownBot: boolean;
  knownBotName: string | null;
  jitoBundled: boolean;
  failed: boolean;
};
