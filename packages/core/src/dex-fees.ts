import type { Dex, PoolType } from "./types.js";

// Trading fee in basis points charged by each tracked DEX. Used by CPMM
// reconstruction to apply the fee to the victim's input before computing
// the counterfactual output.
//
// CPMM pools (Raydium v4 / CPMM, Orca classic, Meteora classic):
//   25 bps is the canonical fee. Pools may have custom values; without
//   parsing the pool config on-chain we use the default. The 25 bps
//   approximation produces loss numbers within ~5% of exact for
//   stable-fee pools, which is well within our 5% accuracy target.
//
// CLMM / orderbook / bonding-curve pools: CPMM reconstruction does not
// apply, so the fee table is informational only — the loss dispatcher
// falls through to the back-run profit proxy.
const DEX_FEE_BPS: Record<Dex, bigint> = {
  raydium_amm_v4: 25n,
  raydium_cpmm: 25n,
  raydium_clmm: 0n,
  orca_whirlpool: 0n,
  meteora_dlmm: 0n,
  meteora_damm_v2: 25n,
  phoenix: 0n,
  pumpswap: 25n,
  pumpfun_bonding: 100n,
  lifinity_v2: 25n,
  unknown: 25n,
};

const DEX_POOL_TYPE: Record<Dex, PoolType> = {
  raydium_amm_v4: "cpmm",
  raydium_cpmm: "cpmm",
  raydium_clmm: "clmm",
  orca_whirlpool: "clmm",
  meteora_dlmm: "clmm",
  meteora_damm_v2: "cpmm",
  phoenix: "orderbook",
  pumpswap: "cpmm",
  pumpfun_bonding: "bonding_curve",
  lifinity_v2: "cpmm",
  unknown: "cpmm",
};

export function getDexFeeBps(dex: Dex): bigint {
  return DEX_FEE_BPS[dex] ?? 25n;
}

export function getPoolType(dex: Dex): PoolType {
  return DEX_POOL_TYPE[dex] ?? "cpmm";
}

// Pools where CPMM reconstruction applies. Other types fall through to
// the back-run profit proxy.
export function isCpmmDex(dex: Dex): boolean {
  return getPoolType(dex) === "cpmm";
}
