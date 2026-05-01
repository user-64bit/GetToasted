import type { Redis } from "ioredis";
import { logger } from "./logger.js";
import { BLOCK_TIME_TTL_SECONDS, redisKeys } from "./redis-keys.js";

// Resolve a slot's block time (UNIX seconds) via the Solana RPC, with a Redis cache.
// We keep this in @get-toasted/runtime since both api and workers occasionally
// need to backfill blockTime (e.g. realtime detector when txs cross slot boundary).
export function createBlockTimeResolver(opts: { redis: Redis; rpcUrl: string }) {
  const { redis, rpcUrl } = opts;

  const fetchBlockTime = async (slot: bigint): Promise<number | null> => {
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getBlockTime",
          params: [Number(slot)],
        }),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { result?: number | null };
      return typeof json.result === "number" ? json.result : null;
    } catch (err) {
      logger.debug({ err, slot: slot.toString() }, "block-time: fetch failed");
      return null;
    }
  };

  return {
    async getBlockTime(slot: bigint): Promise<Date | null> {
      const key = redisKeys.blockTime(slot);
      const cached = await redis.get(key);
      if (cached) {
        const ts = parseInt(cached, 10);
        if (Number.isFinite(ts)) return new Date(ts * 1000);
      }
      const ts = await fetchBlockTime(slot);
      if (ts === null) return null;
      await redis.set(key, String(ts), "EX", BLOCK_TIME_TTL_SECONDS);
      return new Date(ts * 1000);
    },
  };
}

export type BlockTimeResolver = ReturnType<typeof createBlockTimeResolver>;
