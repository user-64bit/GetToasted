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

export type PoolType = "cpmm" | "clmm" | "orderbook" | "bonding_curve";

export type PoolReserves = {
  tokenA: bigint;
  tokenB: bigint;
  tokenAMint: string;
  tokenBMint: string;
};

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
  // Reserves of the pool's two vault accounts immediately before / after
  // this tx. Best-effort: the block expander identifies the pool's vaults
  // by intersecting `meta.preTokenBalances` against the swap's input/output
  // mints and excluding the fee payer. Null when we can't pin them down
  // (CLMM pools, custom vault layouts, missing balances) — the loss
  // pipeline falls back to the back-run profit proxy in that case.
  poolReservesBefore?: PoolReserves | null;
  poolReservesAfter?: PoolReserves | null;
};
