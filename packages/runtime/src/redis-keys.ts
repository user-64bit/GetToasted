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
  decimals: (mint: string) => `mint:dec:${mint}`,
  webhookId: () => `helius:webhookId`,
  statsCache: () => `stats:global`,
} as const;

export const SCAN_LOCK_TTL_SECONDS = 600;
export const PRICE_CACHE_TTL_SECONDS = 48 * 60 * 60;
export const LEADER_SCHEDULE_TTL_SECONDS = 3 * 24 * 60 * 60;
export const STATS_CACHE_TTL_SECONDS = 5 * 60;
export const BLOCK_TIME_TTL_SECONDS = 6 * 60 * 60;
export const DECIMALS_TTL_SECONDS = 30 * 24 * 60 * 60;
