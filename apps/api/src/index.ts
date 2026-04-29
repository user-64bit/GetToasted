import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { v1 } from "./routes/v1/index.js";
import { auth } from "./routes/auth/index.js";
import { webhooks } from "./routes/webhooks/index.js";

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: [process.env.APP_URL ?? "http://localhost:3000"],
    credentials: true,
  }),
);

app.get("/health", (c) => c.json({ ok: true, t: Date.now() }));
app.route("/api/v1", v1);
app.route("/api/auth", auth);
app.route("/api/webhooks", webhooks);

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`API listening on :${port}`);
