import type { Redis } from "ioredis";
import { logger } from "./logger.js";
import { DECIMALS_TTL_SECONDS, redisKeys } from "./redis-keys.js";

const KNOWN_DECIMALS: Record<string, number> = {
  So11111111111111111111111111111111111111112: 9,
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 6,
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: 6,
};

export function createDecimalsResolver(opts: { redis: Redis; rpcUrl: string }) {
  const { redis, rpcUrl } = opts;

  const fetchDecimals = async (mint: string): Promise<number | null> => {
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTokenSupply",
          params: [mint],
        }),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as {
        result?: { value?: { decimals?: number } };
      };
      const decimals = json.result?.value?.decimals;
      return typeof decimals === "number" ? decimals : null;
    } catch (err) {
      logger.debug({ err, mint }, "decimals: fetch failed");
      return null;
    }
  };

  return {
    async getDecimals(mint: string): Promise<number | null> {
      if (KNOWN_DECIMALS[mint] !== undefined) return KNOWN_DECIMALS[mint]!;
      const key = redisKeys.decimals(mint);
      const cached = await redis.get(key);
      if (cached !== null) {
        const parsed = parseInt(cached, 10);
        if (Number.isFinite(parsed)) return parsed;
      }
      const fresh = await fetchDecimals(mint);
      if (fresh !== null) {
        await redis.set(key, String(fresh), "EX", DECIMALS_TTL_SECONDS);
      }
      return fresh;
    },
  };
}

export type DecimalsResolver = ReturnType<typeof createDecimalsResolver>;
