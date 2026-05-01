import { Hono } from "hono";
import { Stats } from "@get-toasted/db";
import { redisKeys, STATS_CACHE_TTL_SECONDS } from "@get-toasted/runtime";
import { db, redis } from "../../lib/connections.js";

export const stats = new Hono();

stats.get("/", async (c) => {
  const cached = await redis.get(redisKeys.statsCache());
  if (cached) {
    return c.body(cached, 200, { "Content-Type": "application/json" });
  }

  const result = await Stats.getGlobalStats(db);
  const body = JSON.stringify(result);
  await redis.set(redisKeys.statsCache(), body, "EX", STATS_CACHE_TTL_SECONDS);
  return c.body(body, 200, { "Content-Type": "application/json" });
});
