import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  for (const path of [resolve(process.cwd(), "../../.env"), resolve(process.cwd(), ".env")]) {
    try {
      for (const line of readFileSync(path, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
        if (!m) continue;
        const [, key, rawValue] = m;
        if (process.env[key]) continue;
        process.env[key] = rawValue.replace(/^["']|["']$/g, "");
      }
    } catch {
      // file missing — try next path
    }
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Add it to .env at the repo root.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL },
  verbose: true,
  strict: true,
});
