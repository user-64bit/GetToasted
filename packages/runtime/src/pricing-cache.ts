import type { Redis } from "ioredis";
import { SOL_MINT } from "@get-toasted/core";
import { logger } from "./logger.js";
import { PRICE_CACHE_TTL_SECONDS, redisKeys } from "./redis-keys.js";

const JUPITER_PRICE_URL = "https://lite-api.jup.ag/price/v2";
const PRO_PRICE_URL = "https://api.jup.ag/price/v2";

export type PriceClient = {
  getTokenPriceUsd(mint: string, atTimestamp: Date): Promise<number | null>;
  getManyTokenPricesUsd(mints: string[]): Promise<Record<string, number | null>>;
};

export function createPriceClient(opts: {
  redis: Redis;
  jupiterApiKey?: string;
}): PriceClient {
  const { redis, jupiterApiKey } = opts;
  const baseUrl = jupiterApiKey ? PRO_PRICE_URL : JUPITER_PRICE_URL;
  const headers: Record<string, string> = jupiterApiKey
    ? { "x-api-key": jupiterApiKey }
    : {};

  const fetchSingle = async (mint: string): Promise<number | null> => {
    try {
      const res = await fetch(`${baseUrl}?ids=${encodeURIComponent(mint)}`, { headers });
      if (!res.ok) {
        logger.debug({ mint, status: res.status }, "jupiter-price: non-200");
        return null;
      }
      const json = (await res.json()) as { data?: Record<string, { price?: number | string } | null> };
      const entry = json.data?.[mint];
      if (!entry || entry.price === undefined || entry.price === null) return null;
      const price = typeof entry.price === "string" ? parseFloat(entry.price) : entry.price;
      return Number.isFinite(price) ? price : null;
    } catch (err) {
      logger.debug({ err, mint }, "jupiter-price: fetch failed");
      return null;
    }
  };

  const getTokenPriceUsd = async (mint: string, atTimestamp: Date): Promise<number | null> => {
    if (!mint) return null;
    const hourBucket = Math.floor(atTimestamp.getTime() / 3_600_000);
    const key = redisKeys.priceCache(mint, hourBucket);
    const cached = await redis.get(key);
    if (cached !== null) {
      const parsed = parseFloat(cached);
      return Number.isFinite(parsed) ? parsed : null;
    }
    const price = await fetchSingle(mint);
    if (price !== null) {
      await redis.set(key, String(price), "EX", PRICE_CACHE_TTL_SECONDS);
    }
    return price;
  };

  const getManyTokenPricesUsd = async (
    mints: string[],
  ): Promise<Record<string, number | null>> => {
    const out: Record<string, number | null> = {};
    if (mints.length === 0) return out;
    const unique = Array.from(new Set(mints.filter(Boolean)));
    const now = new Date();
    await Promise.all(
      unique.map(async (m) => {
        out[m] = await getTokenPriceUsd(m, now);
      }),
    );
    return out;
  };

  // SOL is canonical: pre-warm even if not requested by caller.
  void getTokenPriceUsd(SOL_MINT, new Date()).catch(() => null);

  return { getTokenPriceUsd, getManyTokenPricesUsd };
}
