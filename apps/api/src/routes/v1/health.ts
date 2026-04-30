import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db, redis } from "../../lib/connections.js";

export const health = new Hono();

// GET /api/v1/health/db — liveness check for Postgres and Redis
health.get("/db", async (c) => {
  const checks = await Promise.allSettled([
    Promise.race([db.execute(sql`SELECT 1`), timeout(3000)]),
    Promise.race([redis.ping(), timeout(1000)]),
  ]);

  const postgres = checks[0]!.status === "fulfilled" ? "ok" : "error";
  const redisStatus = checks[1]!.status === "fulfilled" ? "ok" : "error";

  const status = postgres === "ok" && redisStatus === "ok" ? 200 : 503;
  return c.json({ postgres, redis: redisStatus }, status);
});

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), ms),
  );
}
