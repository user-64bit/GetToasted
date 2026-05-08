export const redisKeys = {
  scanLock: (wallet: string) => `scan:lock:${wallet}`,
  scanProgress: (wallet: string) => `scan:progress:${wallet}`,
  rateIp: (ip: string) => `rate:ip:${ip}`,
  rateKey: (key: string) => `rate:key:${key}`,
  rateWindow: (ip: string, windowMin: number) => `rate:ip:${ip}:${windowMin}`,
  leaderEpoch: (epoch: number) => `leader:${epoch}`,
  priceCache: (mint: string, hourBucket: number) => `price:${mint}:${hourBucket}`,
  alertsQueue: (wallet: string) => `alerts:queue:${wallet}`,
  authNonce: (nonce: string) => `siws:nonce:${nonce}`,
  blockTime: (slot: bigint) => `slot:bt:${slot.toString()}`,
  blockSwaps: (slot: bigint) => `slot:swaps:${slot.toString()}`,
  blockSwapsLock: (slot: bigint) => `slot:swaps:lock:${slot.toString()}`,
  blockSwapsMissing: (slot: bigint) => `slot:swaps:missing:${slot.toString()}`,
  decimals: (mint: string) => `mint:dec:${mint}`,
  webhookId: () => `helius:webhookId`,
  statsCache: () => `stats:global`,
  jitoBundleByTx: (signature: string) => `jito:bundle:tx:${signature}`,
} as const;

export const SCAN_LOCK_TTL_SECONDS = 600;
export const PRICE_CACHE_TTL_SECONDS = 48 * 60 * 60;
export const LEADER_SCHEDULE_TTL_SECONDS = 3 * 24 * 60 * 60;
export const STATS_CACHE_TTL_SECONDS = 5 * 60;
export const BLOCK_TIME_TTL_SECONDS = 6 * 60 * 60;
export const DECIMALS_TTL_SECONDS = 30 * 24 * 60 * 60;
// Finalized blocks are immutable, so keep parsed swaps for a long time. We
// still cap at 14d to bound Redis usage on the Fixed 250MB plan.
export const BLOCK_SWAPS_TTL_SECONDS = 14 * 24 * 60 * 60;
// Negative cache for skipped/missing slots — much shorter, in case Helius
// catches up with archival data.
export const BLOCK_SWAPS_MISSING_TTL_SECONDS = 6 * 60 * 60;
// In-flight lock so concurrent scanners don't both hammer getBlock for the
// same slot. TTL is short — if the holder dies we want to retry quickly.
export const BLOCK_SWAPS_LOCK_TTL_SECONDS = 90;
// Jito bundle membership is immutable once a bundle has landed, so positive
// hits cache for a long time. Negative cache is shorter — Jito's recent
// endpoint can lag behind block finalization by minutes.
export const JITO_BUNDLE_TTL_SECONDS = 7 * 24 * 60 * 60;
export const JITO_BUNDLE_MISSING_TTL_SECONDS = 60 * 60;
