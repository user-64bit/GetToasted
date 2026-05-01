import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db, redis } from "../../lib/connections.js";

export const health = new Hono();

function timeout<T>(ms: number, label: string): Promise<T> {
  return new Promise<T>((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timeout`)), ms),
  );
}

health.get("/db", async (c) => {
  const checks = await Promise.allSettled([
    Promise.race([db.execute(sql`SELECT 1`), timeout(3000, "db")]),
    Promise.race([redis.ping(), timeout(1000, "redis")]),
  ]);
  const postgres = checks[0]?.status === "fulfilled" ? "ok" : "error";
  const redisStatus = checks[1]?.status === "fulfilled" ? "ok" : "error";
  const status = postgres === "ok" && redisStatus === "ok" ? 200 : 503;
  return c.json({ postgres, redis: redisStatus }, status);
});

health.get("/ready", async (c) => {
  const [pg, rd] = await Promise.allSettled([
    Promise.race([db.execute(sql`SELECT 1`), timeout(3000, "db")]),
    Promise.race([redis.ping(), timeout(1000, "redis")]),
  ]);
  const checks = {
    db: pg.status === "fulfilled" ? "ok" : "down",
    redis: rd.status === "fulfilled" ? "ok" : "down",
  };
  const allOk = Object.values(checks).every((v) => v === "ok");
  return c.json(
    {
      status: allOk ? "ok" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
    },
    allOk ? 200 : 503,
  );
});
