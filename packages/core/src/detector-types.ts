import type { ParsedSwap } from "./types.js";

// Detection confidence layers, ordered highest → lowest. The pipeline
// short-circuits at the first match: if L1 fires, L2-L5 are not run.
//   L1 — Jito bundle membership (front + victim + back co-bundled)
//   L2 — Block adjacency (txIndex i, i+1, i+2 same signer for f/b)
//   L3 — Same-slot, known-bot signer, A→B→A pattern
//   L4 — Same-slot statistical match against an unknown signer
//   L5 — Cross-slot wide sandwich (≤2 slots, known bot)
export type DetectionLayer = "L1" | "L2" | "L3" | "L4" | "L5";

// Confidence ≥ 0.80 = confirmed, < 0.80 = suspected. The boundary is set
// by the layered classifier (L1/L2 = confirmed, L4/L5 = suspected).
export type DetectionStatus = "confirmed" | "suspected";

export type LossMethod =
  | "cpmm-reconstruction"
  | "backrun-profit-proxy"
  | "failed-backrun-slippage";

export type JitoBundleInfo = {
  bundleId: string;
  // Ordered as bundled. Front-run is at index 0, victim somewhere in the
  // middle, back-run last (typical 3-tx sandwich). Multi-victim bundles
  // can have more entries.
  signaturesInBundle: string[];
  landedSlot: number;
  tipLamports: bigint;
};

// Async resolver — passed into the L1 detector so core stays I/O-free at
// import time. Production impl lives in @get-toasted/runtime and hits the
// Jito bundles API with Redis caching.
export type JitoBundleResolver = {
  getBundleForTx(signature: string): Promise<JitoBundleInfo | null>;
};

export type LossCalculation = {
  method: LossMethod;
  // What the victim actually received (output-token base units).
  actualOutput: bigint;
  // What the victim would have received absent the front-run.
  counterfactualOutput: bigint;
  // counterfactualOutput - actualOutput, clamped to >= 0.
  lossInOutputToken: bigint;
  // Filled in downstream by the price oracle. Null when no price data
  // is available for the output mint — the UI should surface this as
  // "loss in tokens, USD unknown" rather than $0.
  lossUsd: number | null;
  // 1.00 = exact reconstruction, 0.85 = back-run profit proxy,
  // 0.50 = failed back-run slippage estimate. Distinct from
  // detection confidence: a high-confidence detection (L1) can still
  // have low-confidence loss math if reserves are unavailable.
  lossConfidence: number;
};

export type SandwichDetection = {
  victim: ParsedSwap;
  frontRun: ParsedSwap;
  backRun: ParsedSwap;
  attacker: string;
  pool: string;
  layer: DetectionLayer;
  confidence: number;
  status: DetectionStatus;
  jitoBundled: boolean;
  jitoTipLamports: bigint;
  loss: LossCalculation;
  detectedAt: Date;
};

// Convenience: layer outputs everything except `loss` (filled by the loss
// dispatcher) and `detectedAt` (filled by the orchestrator). Keeps the
// layer functions focused on classification, not bookkeeping.
export type LayerMatch = Omit<SandwichDetection, "loss" | "detectedAt">;
