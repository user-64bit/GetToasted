import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { serverEnv } from "@get-toasted/env";
import { sql } from "drizzle-orm";
import { db, redis } from "./lib/connections.js";
import { v1 } from "./routes/v1/index.js";
import { auth } from "./routes/auth/index.js";
import { webhooks } from "./routes/webhooks/index.js";
import type { Context, Next } from "hono";

const app = new Hono();

// CORS — credentials required for HttpOnly cookie auth
app.use(
  "*",
  cors({
    origin: (origin) => {
      const allowed = [
        serverEnv.CORS_ORIGIN ?? serverEnv.APP_URL,
        "http://localhost:3000",
      ].filter(Boolean) as string[];
      return allowed.includes(origin) ? origin : null;
    },
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }),
);

app.use("*", logger());

// Sliding-window rate limiter: 100 req/min per IP
app.use("*", async (c: Context, next: Next) => {
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip") ??
    "unknown";
  const window = Math.floor(Date.now() / 60000);
  const key = `ratelimit:${ip}:${window}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 60);
  if (count > 100) {
    return c.json({ error: "rate_limited" }, 429);
  }
  return next();
});

app.get("/health", (c) =>
  c.json({ status: "ok", timestamp: new Date().toISOString(), uptime: process.uptime() }),
);

app.route("/api/auth", auth);
app.route("/api/v1", v1);
app.route("/api/webhooks", webhooks);

// Startup: verify DB + Redis connectivity, then serve
async function start() {
  // Postgres connectivity check
  try {
    await db.execute(sql`SELECT 1`);
    console.log("Postgres connected");
  } catch (err) {
    console.error("Postgres connection failed:", err);
    process.exit(1);
  }

  // Redis connectivity check
  try {
    await redis.ping();
    console.log("Redis connected");
  } catch (err) {
    console.error("Redis connection failed:", err);
    process.exit(1);
  }

  const port = serverEnv.PORT;
  const server = serve({ fetch: app.fetch, port });
  console.log(`GetToasted API running on port ${port}`);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`${signal} received — shutting down`);
    server.close(() => {
      redis.disconnect();
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start();
