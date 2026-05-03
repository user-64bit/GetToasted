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
  // Jito bundle membership keyed by signature. Bundles are immutable
  // once landed, so we cache for 7 days. A negative result (signature
  // not in any bundle) is also cached — many sandwich victims aren't
  // bundled, and re-querying the bundle API for every miss is wasteful.
  jitoBundleBySig: (sig: string) => `jito:bundle:sig:${sig}`,
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
// Jito bundle membership cache — landed bundles never change, so we keep
// hits for 7 days. Negative results (sig not in a bundle) get a shorter
// TTL because the same sig may eventually appear in a backfilled bundle
// index, and we'd rather pay the API cost than persist a wrong miss.
export const JITO_BUNDLE_HIT_TTL_SECONDS = 7 * 24 * 60 * 60;
export const JITO_BUNDLE_MISS_TTL_SECONDS = 60 * 60;
