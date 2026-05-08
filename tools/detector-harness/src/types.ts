export interface JitoBundle {
  bundleId: string;
  slot: number;
  validator: string | null;
  tippers: string[];
  landedTipLamports: number;
  landedCu: number | null;
  blockIndex: number | null;
  timestamp: string | null;
  txSignatures: string[];
}

export interface TokenDelta {
  accountIndex: number;
  account: string;
  mint: string;
  owner: string | null;
  amount: bigint;
  decimals: number;
}

export interface LamportDelta {
  accountIndex: number;
  account: string;
  amount: bigint;
}

export interface TxSummary {
  signature: string;
  slot: number;
  txIndex: number;
  feePayer: string;
  signers: string[];
  programs: string[];
  dex: string;
  tokenDeltas: TokenDelta[];
  lamportDeltas: LamportDelta[];
  err: unknown;
}

export interface LossCalculation {
  method: "cpmm-reconstruction" | "backrun-proxy" | "failed-backrun-slippage";
  confidence: number;
  victimActualOutput: string | null;
  victimCounterfactualOutput: string | null;
  lossInOutputToken: string | null;
  outputTokenMint: string;
  outputTokenDecimals: number;
  lossInProxyToken: {
    amount: string;
    mint: string;
    usdPrice: number | null;
  } | null;
  lossUsd: number | null;
  outputTokenPriceAtSlot: number | null;
  notes: string | null;
}

export interface HarnessDetection {
  classifier: "bundle" | "coin-flow" | "adjacency" | "known-bot" | "statistical";
  confidence: number;
  status: "confirmed" | "suspected";
  slot: number;
  bundleId: string | null;
  attacker: string;
  frontRun: {
    signature: string;
    signer: string;
    txIndex: number;
  };
  victim: {
    signature: string;
    signer: string;
    txIndex: number;
  };
  backRun: {
    signature: string;
    signer: string;
    txIndex: number;
  };
  pool: string;
  dex: string;
  attackedMint: string;
  quoteMint: string | null;
  knownBotMatch: {
    matched: boolean;
    registryName: string | null;
    registryAddress: string | null;
  };
  frontTokenAmount: string;
  victimTokenAmount: string;
  backTokenAmount: string;
  scoring: {
    rules: string[];
    penalties: string[];
  };
  loss: LossCalculation;
}
