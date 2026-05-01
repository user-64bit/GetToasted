import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

// Walk up from cwd looking for a .env file and populate process.env with any
// keys that aren't already set. Lets every workspace (api, workers, …) share
// the repo-root .env without per-package --env-file wiring. Next.js loads its
// own .env files, so this is a no-op for web/docs.
function loadDotenvFromAncestors(): void {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    try {
      const text = readFileSync(resolve(dir, ".env"), "utf8");
      for (const line of text.split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
        if (!m) continue;
        const [, key, raw] = m;
        if (process.env[key] !== undefined) continue;
        process.env[key] = raw.replace(/^["']|["']$/g, "");
      }
      return;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) return;
      dir = parent;
    }
  }
}
loadDotenvFromAncestors();

export const serverEnv = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    HELIUS_API_KEY: z.string().min(1),
    HELIUS_WEBHOOK_SECRET: z.string().min(1),
    HELIUS_RPC_URL: z.string().url().optional(),
    HELIUS_WEBHOOK_ID: z.string().min(1).optional(),
    JWT_SECRET: z.string().min(32),
    JUPITER_API_KEY: z.string().min(1).optional(),
    VALIDATORS_APP_TOKEN: z.string().min(1).optional(),
    APP_URL: z.string().url(),
    API_BASE_URL: z.string().url().optional(),
    CORS_ORIGIN: z.string().url().optional(),
    SIWS_DOMAIN: z.string().min(1).optional(),
    PORT: z.coerce.number().default(3001),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

export type ServerEnv = typeof serverEnv;
