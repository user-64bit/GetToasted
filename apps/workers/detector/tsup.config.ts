import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  noExternal: [
    "@get-toasted/core",
    "@get-toasted/db",
    "@get-toasted/env",
    "@get-toasted/helius",
    "@get-toasted/schemas",
  ],
});
