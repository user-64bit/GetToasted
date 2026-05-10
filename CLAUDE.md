# Get Toasted (GetToasted) — Project Context for Claude Code

## What this is

SaaS that scans Solana wallets for sandwich attacks and quantifies USD losses.
Hackathon timeline: 5 weeks. Solo dev.

## Branding

- **Product name**: Get Toasted / GetToasted (used interchangeably)
- **Package scope**: `@get-toasted/*` (NOT `@mev-shield/*`)

## Architecture

```
apps/
  web/          → Next.js 16, App Router, shadcn, Tailwind v4 — Vercel
  api/          → Hono on Node 20, BullMQ queue producer — Railway
  docs/         → Next.js docs site — keep, do not delete
  workers/
    scanner/    → BullMQ: scan-historical queue (Helius paginated fetch)
    detector/   → BullMQ: scan-realtime queue (webhook-triggered)
    risk-analyzer/  → BullMQ: risk-score queue (cron, Jupiter quote)
    validator-refresh/ → BullMQ: validator-refresh queue (cron, RPC)
packages/
  core/         → Layered sandwich detector (L1-L4), loss methods, post-filters,
                  bot registry — NO Node-only imports
  runtime/      → Node-only runtime utils: block-expander (Helius),
                  jito-bundle client, detection-enricher, redis keys, pino logger
  db/           → Drizzle schema + client (Neon postgres-js)
  schemas/      → Zod validators shared client+server
  helius/       → Typed Helius API client
  jupiter/      → Typed Jupiter Lite quote client
  env/          → @t3-oss/env-core typed env (serverEnv)
  tsconfig/     → Shared tsconfig presets (base, node, nextjs)
  ui/           → Shared React component library (shadcn)
  eslint-config/ → Shared ESLint config
tools/
  detector-harness/ → Workspace package (@get-toasted/detector-harness)
                      that imports from @get-toasted/core directly. CLI:
                      validate-mined, mine-from-known-bots, validate-wallet,
                      diagnose-slot, debug-miss, debug-extra. Validates
                      production code, not a fork.
```

## Tech Stack

- **Monorepo**: Turborepo + pnpm 9 workspaces
- **Runtime**: Node 20 (all apps and workers)
- **Frontend**: Next.js 16, App Router, shadcn/ui, Tailwind v4
- **Backend**: Hono (Node adapter), `@hono/zod-validator`
- **Queue**: BullMQ + Upstash Redis (Fixed 250MB plan — NOT payg)
- **Database**: Drizzle ORM + Neon Postgres (pooled URL for runtime, direct for migrations)
- **Auth**: Sign In With Solana (SIWS) → JWT via `jose`
- **Solana**: `@solana/kit` (NOT web3.js v1 unless forced by a dep)
- **Crypto**: `@noble/curves` for ed25519 signature verification

## Hard Rules

- **Never use Prisma** — we use Drizzle only
- **Never use Solana web3.js v1** unless a transitive dep forces it; prefer `@solana/kit`
- **Pin zod to v3.x** — react-hook-form resolver compat (`"zod": "^3.23.0"`)
- **Use ESM everywhere** — `"type": "module"` in every package
- **Use `bigint` for token amounts and slot numbers** — never `number`
- **Detector lives in `@get-toasted/core` only** — never duplicate the heuristic
- **All Hono routes must validate input** with `@hono/zod-validator`
- **`prepare: false`** on postgres-js client — required for Neon pooler / PgBouncer
- **Do NOT delete `apps/docs`** — it's needed

## Queue Names (BullMQ)

| Queue | Producer | Consumer |
|---|---|---|
| `scan-historical` | `apps/api` (POST /wallets/:address/scan) | `apps/workers/scanner` |
| `scan-realtime` | `apps/api` (POST /webhooks/helius) | `apps/workers/detector` |
| `risk-score` | cron via BullMQ scheduler | `apps/workers/risk-analyzer` |
| `validator-refresh` | cron via BullMQ scheduler | `apps/workers/validator-refresh` |

## Validation strategy

- **Primary ground truth: Jito bundle membership.** Mined mechanically via
  `pnpm harness mine-from-known-bots --bots <signer>`. Validation is
  `pnpm harness validate-mined <jsonPath>` running production
  `detectSandwichesForWalletSwaps` against each mined tuple.
- **Sandwiched.me has NO per-victim-wallet route.** Don't waste time
  trying to scrape it.
- **Wide non-bundled (L4 statistical) sandwiches need manual spot-check.**
  No automated ground truth exists for these.
- See `DETECTOR.md` "Validation strategy" section for the full protocol.

## Out of Scope for v1

- L5 cross-slot wide sandwich (deferred per algorithm spec §13)
- Phoenix Eternal / spline-AMM perpetuals coverage (see `BACKLOG.md`)
- JIT liquidity detection
- Stripe / payments UI
- Public API key management UI
- ClickHouse / Tinybird analytics
- Multi-wallet batch scanning

## Environment Variables

Production secrets via Doppler; local dev via `.env` (see `.env.example`).
Full typed schema in `packages/env/src/index.ts`.

Required: `DATABASE_URL`, `REDIS_URL`, `HELIUS_API_KEY`, `HELIUS_WEBHOOK_SECRET`, `JWT_SECRET`, `APP_URL`

Operational tunables: `MAX_SCAN_SIGNATURES` (default 1000),
`MAX_SCAN_SLOTS` (default 200), `MAX_SCAN_DURATION_MS` (default 60000 —
bump for backfill scans).

## Deployment

| Service | Platform | Root Dir | Start |
|---|---|---|---|
| web | Vercel | `apps/web` | `pnpm --filter web build` |
| api | Railway | `apps/api` | `pnpm start` |
| worker-scanner | Railway | `apps/workers/scanner` | `pnpm start` |
| worker-detector | Railway | `apps/workers/detector` | `pnpm start` |
| worker-risk | Railway | `apps/workers/risk-analyzer` | `pnpm start` |
| worker-validator | Railway | `apps/workers/validator-refresh` | `pnpm start` |
