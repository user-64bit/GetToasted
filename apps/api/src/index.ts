import { serve } from "@hono/node-server";
import { Hono, type Context, type Next } from "hono";
import { logger as honoLogger } from "hono/logger";
import { cors } from "hono/cors";
import { serverEnv } from "@get-toasted/env";
import { sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { logger, redisKeys } from "@get-toasted/runtime";
import { ApiKeys } from "@get-toasted/db";
import { db, redis } from "./lib/connections.js";
import { v1 } from "./routes/v1/index.js";
import { auth } from "./routes/auth/index.js";
import { webhooks } from "./routes/webhooks/index.js";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return null;
      const allowed = [
        serverEnv.CORS_ORIGIN ?? serverEnv.APP_URL,
        "http://localhost:3000",
      ].filter((v): v is string => Boolean(v));
      return allowed.includes(origin) ? origin : null;
    },
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }),
);

app.use("*", honoLogger());

app.use("*", async (c: Context, next: Next) => {
  if (c.req.path.startsWith("/api/webhooks")) return next();

  const presented = c.req.header("x-api-key");
  if (presented) {
    const hash = createHash("sha256").update(presented).digest("hex");
    const row = await ApiKeys.getApiKeyByHash(db, hash);
    if (!row) {
      return c.json({ error: "invalid_api_key", code: "API_KEY_INVALID" }, 401);
    }
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      return c.json({ error: "expired_api_key", code: "API_KEY_EXPIRED" }, 401);
    }
    const window = Math.floor(Date.now() / 60_000);
    const bucket = `${redisKeys.rateKey(row.id)}:${window}`;
    const count = await redis.incr(bucket);
    if (count === 1) await redis.expire(bucket, 60);
    if (count > row.rateLimit) {
      return c.json(
        { error: "rate_limited", code: "RATE_LIMIT_KEY" },
        429,
        { "Retry-After": "60" },
      );
    }
    c.set("apiKeyId", row.id);
    void ApiKeys.touchApiKeyLastUsed(db, row.id).catch((err: unknown) => {
      logger.warn({ err, keyId: row.id }, "api: failed to touch api key");
    });
    return next();
  }

  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    c.req.header("x-real-ip") ??
    "unknown";
  const window = Math.floor(Date.now() / 60_000);
  const key = redisKeys.rateWindow(ip, window);
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 60);
  if (count > 100) {
    return c.json(
      { error: "rate_limited", code: "RATE_LIMIT_IP" },
      429,
      { "Retry-After": "60" },
    );
  }
  return next();
});

declare module "hono" {
  interface ContextVariableMap {
    apiKeyId: string;
  }
}

app.get("/health", (c) =>
  c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }),
);

app.route("/api/auth", auth);
app.route("/api/v1", v1);
app.route("/api/webhooks", webhooks);

app.onError((err, c) => {
  logger.error(
    { err, path: c.req.path, method: c.req.method },
    "api: unhandled route error",
  );
  // Surface the underlying error message in non-prod so the dashboard
  // can render it instead of an opaque "internal_server_error". Common
  // case it helps debug: postgres "column does not exist" when a
  // migration hasn't been applied. We never expose error.stack and we
  // never expose anything in production — `NODE_ENV=production` keeps
  // the response shape stable for clients in real deploys.
  const isProd = process.env.NODE_ENV === "production";
  const detail =
    isProd || !(err instanceof Error)
      ? undefined
      : err.message.slice(0, 500); // bound the payload
  return c.json(
    { error: "internal_server_error", ...(detail ? { detail } : {}) },
    500,
  );
});

app.notFound((c) => c.json({ error: "not_found", path: c.req.path }, 404));

async function start(): Promise<void> {
  try {
    await db.execute(sql`SELECT 1`);
    logger.info("api: postgres connected");
  } catch (err) {
    logger.error({ err }, "api: postgres connection failed");
    process.exit(1);
  }

  try {
    await redis.ping();
    logger.info("api: redis connected");
  } catch (err) {
    logger.error({ err }, "api: redis connection failed");
    process.exit(1);
  }

  const port = serverEnv.PORT;
  const server = serve({ fetch: app.fetch, port });
  logger.info({ port }, "api: listening");

  const shutdown = (signal: string): void => {
    logger.info({ signal }, "api: shutting down");
    server.close(() => {
      redis.disconnect();
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((err: unknown) => {
  logger.error({ err }, "api: startup failed");
  process.exit(1);
});
