# Get Toasted

> Scan any Solana wallet for sandwich attacks and quantify the USD lost to MEV.

Get Toasted is a SaaS that ingests a wallet's transaction history (via Helius), runs a typed sandwich-detection pipeline over each slot, prices the impact in USD using Jupiter quotes, and exposes the results via an API + dashboard. Real-time scans are driven by Helius webhooks; historical scans are paginated through BullMQ workers.

- **Live**: https://gettoasted.fun
- **Detector internals**: see [`DETECTOR.md`](./DETECTOR.md) — layered classifier, loss methods, validation strategy.
- **Validation**: 30/30 Jito-bundle ground-truth match rate. Reproducible via `pnpm harness validate-mined` — see [`tools/detector-harness/README.md`](./tools/detector-harness/README.md).
- **Submission notes**: [`SUBMISSION.md`](./SUBMISSION.md).
- **Open work**: [`BACKLOG.md`](./BACKLOG.md).

---

## Table of contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Tech stack](#tech-stack)
4. [Repo layout](#repo-layout)
5. [Prerequisites](#prerequisites)
6. [Quick start (local dev)](#quick-start-local-dev)
7. [Quick start (Docker Compose)](#quick-start-docker-compose)
8. [Environment variables](#environment-variables)
9. [Database & migrations](#database--migrations)
10. [Queues & workers](#queues--workers)
11. [API surface](#api-surface)
12. [Common scripts](#common-scripts)
13. [Deployment](#deployment)
14. [Project conventions](#project-conventions)
15. [Troubleshooting](#troubleshooting)

---

## Features

- **Sandwich detection** — typed pipeline in `@get-toasted/core` that classifies front-run / victim / back-run sets per slot with a confidence score.
- **USD loss quantification** — Jupiter Lite quotes are used to compute the dollar amount extracted from each victim trade.
- **Historical wallet scan** — paginated Helius fetch dispatched to a BullMQ `scan-historical` queue.
- **Real-time detection** — Helius webhook → HMAC-verified ingest → `scan-realtime` queue → detector worker.
- **Risk scoring** — periodic `risk-score` cron rolls aggregates per wallet.
- **Validator metadata refresh** — `validator-refresh` cron pulls vote accounts and labels Jito / non-Jito validators.
- **Sign In With Solana (SIWS)** — ed25519 signature verification, JWT issuance via `jose`.
- **Per-IP rate limiting** at the API edge (Redis sliding window).

---

## Architecture

```
                          ┌──────────────────┐
   Helius webhook  ─────► │  apps/api (Hono) │ ──► Postgres (Drizzle)
                          │  /api/webhooks   │ ──► Redis  (BullMQ)
                          │  /api/v1/*       │
                          │  /api/auth/*     │
                          └──────┬───────────┘
                                 │ enqueue
                ┌────────────────┼────────────────────┬──────────────────┐
                ▼                ▼                    ▼                  ▼
        scan-historical    scan-realtime          risk-score       validator-refresh
        (scanner worker)   (detector worker)      (cron worker)    (cron worker)
                │                │                    │                  │
                └─── all workers share @get-toasted/core sandwich detector ──┘
                                          │
                                          ▼
                                Postgres (sandwiches, alerts, validators, …)
                                          ▲
                                          │
                                  apps/web (Next.js 16) ──► /api/v1/* via fetch
```

Data flow:

1. The **web app** (Next.js, Vercel) lets a user connect a Solana wallet and request a scan.
2. The **API** (Hono on Node 20, Railway) validates input, persists a scan row, and pushes a job onto BullMQ.
3. A **worker** picks the job, fetches transactions from Helius, runs detection in `@get-toasted/core`, prices impact via Jupiter, and writes results to Postgres.
4. The web app polls / streams results back from the API.

---

## Tech stack

| Layer        | Choice                                                                |
| ------------ | --------------------------------------------------------------------- |
| Monorepo     | Turborepo + pnpm 9 workspaces                                         |
| Runtime      | Node 20 (every app and worker)                                        |
| Frontend     | Next.js 16 (App Router), React 19, shadcn/ui, Tailwind v4, Recharts   |
| API          | Hono (Node adapter), `@hono/zod-validator`, `@hono/zod-openapi`       |
| Queue        | BullMQ on Upstash Redis (Fixed 250 MB plan)                           |
| Database     | Drizzle ORM + Neon Postgres (pooled URL runtime, direct for migrate)  |
| Auth         | Sign In With Solana (SIWS) → JWT (`jose`), ed25519 via `@noble/curves`|
| Solana       | `@solana/kit` (we avoid web3.js v1)                                   |
| Validation   | Zod v3 (pinned for react-hook-form resolver compat)                   |
| Env          | `@t3-oss/env-core` typed schema                                       |
| Logging      | `pino` via shared `@get-toasted/runtime`                              |

---

## Repo layout

```
apps/
  web/                 Next.js 16 dashboard (deployed to Vercel)
  api/                 Hono HTTP API + BullMQ producer (Railway)
  docs/                Next.js docs site (do not delete)
  workers/
    scanner/           Consumes scan-historical (Helius paginated fetch)
    detector/          Consumes scan-realtime  (webhook-driven)
    risk-analyzer/     Consumes risk-score     (cron, Jupiter quote)
    validator-refresh/ Consumes validator-refresh (cron, RPC getVoteAccounts)

packages/
  core/                Sandwich detector, scoring, constants (no Node-only deps)
  db/                  Drizzle schema, migrations, query helpers, Neon client
  schemas/             Zod validators shared between client and server
  helius/              Typed Helius API client
  jupiter/             Typed Jupiter Lite quote client
  env/                 @t3-oss/env-core typed serverEnv
  runtime/             pino logger, redis key helpers, shared runtime utils
  ui/                  Shared React component library (shadcn primitives)
  tsconfig/            Shared tsconfig presets (base, node, nextjs)
  eslint-config/       Shared ESLint flat configs

infra/
  nginx/               Reverse-proxy config for self-hosted Oracle box
  scripts/             deploy.sh, setup-oracle.sh

docker-compose.yml     Local stack: postgres, redis, api, all four workers
turbo.json             Turbo task graph + env allowlist
pnpm-workspace.yaml
```

---

## Prerequisites

- **Node 20+**
- **pnpm 9** — `corepack enable && corepack prepare pnpm@9.0.0 --activate`
- **Docker** (only required for the `docker-compose` path)
- **A Helius API key** — https://helius.dev (free tier is enough for dev)
- A Postgres instance (local Docker, or a free Neon project)
- A Redis instance (local Docker, or a free Upstash database)

Optional:

- **Doppler CLI** — production secrets are managed in Doppler; local dev uses `.env`.

---

## Quick start (local dev)

This path runs the apps and workers directly with `tsx` / `next dev` so you get fast HMR and visible logs.

```bash
# 1. Install
git clone https://github.com/<you>/GetToasted.git
cd GetToasted
pnpm install

# 2. Configure env
cp .env.example .env
# Edit .env — at minimum set:
#   HELIUS_API_KEY, HELIUS_WEBHOOK_SECRET,
#   JWT_SECRET (32+ chars), APP_URL=http://localhost:3000
# DATABASE_URL / REDIS_URL in .env.example already point at localhost
# (host port 5433 for Postgres, 6379 for Redis), which is what you want
# when running migrations and dev from the host. Leave the values quoted
# only if the shell really needs it — embedded quotes break URLs.

# 3. Bring up Postgres + Redis only (skip the app containers)
docker compose up -d postgres redis

# 4. Run migrations (connects to localhost:5433 → docker postgres)
pnpm db:migrate

# 5. Start everything (api + web + docs + 4 workers)
pnpm dev
```

> **Why host port 5433 (not 5432)?** macOS users frequently have a native Postgres
> already running (Postgres.app, Homebrew, etc.) bound to `127.0.0.1:5432`. It will
> silently intercept connections meant for the Docker container, and `pnpm db:migrate`
> will fail with `role "gettoasted" does not exist` because it hit the wrong Postgres.
> Mapping Docker's Postgres to host port `5433` sidesteps the conflict. If you're sure
> nothing else listens on 5432, you can change it back in `docker-compose.yml` and `.env`.
> Check with `lsof -nP -iTCP:5432 -sTCP:LISTEN`.

`pnpm dev` runs every workspace's `dev` script in parallel:

- `apps/web`  → http://localhost:3000
- `apps/api`  → http://localhost:3001 (health: `GET /health`)
- `apps/docs` → http://localhost:3002
- All four workers attached to BullMQ

To run a single workspace, use a Turbo filter:

```bash
pnpm dev --filter=api
pnpm dev --filter=web
pnpm dev --filter=@get-toasted/db   # for db:studio etc.
```

> **How env vars get loaded.** `@get-toasted/env` walks up from `process.cwd()` to find
> the repo-root `.env` and populates `process.env` before Zod validation runs. That means
> the api and the four workers pick up `.env` automatically when you run them from
> anywhere in the repo — no per-package `--env-file` wiring needed. Next.js apps (web,
> docs) load their own `.env` files via Next directly.

---

## Quick start (Docker Compose)

The `docker-compose.yml` at the repo root builds and runs **everything** (postgres, redis, api, scanner, detector, risk-analyzer, validator-refresh).

```bash
cp .env.example .env       # fill in the secrets
docker compose up --build  # first run pulls + builds; subsequent runs reuse cache
```

The API is exposed on `http://localhost:3001`. Workers run headless; tail logs with:

```bash
docker compose logs -f scanner detector
```

> Note: the web dashboard is **not** part of `docker-compose.yml` — run it locally with `pnpm dev --filter=web` or deploy it separately to Vercel.

---

## Environment variables

The full typed schema lives in `packages/env/src/index.ts`. The minimum set for local dev:

| Var                      | Required | Notes                                                    |
| ------------------------ | -------- | -------------------------------------------------------- |
| `NODE_ENV`               | yes      | `development` \| `test` \| `production`                  |
| `DATABASE_URL`           | yes      | Postgres URL. Use the **pooled** URL on Neon for runtime |
| `REDIS_URL`              | yes      | `redis://...` or `rediss://...` (Upstash uses TLS)       |
| `HELIUS_API_KEY`         | yes      | From dashboard.helius.dev                                |
| `HELIUS_WEBHOOK_SECRET`  | yes      | Used to HMAC-verify inbound webhook payloads             |
| `HELIUS_RPC_URL`         | optional | Falls back to public mainnet RPC                         |
| `HELIUS_WEBHOOK_ID`      | optional | Set after creating the webhook in Helius                 |
| `JWT_SECRET`             | yes      | **≥ 32 chars** — used to sign SIWS-issued JWTs           |
| `JUPITER_API_KEY`        | optional | Higher rate limits on Jupiter Lite                       |
| `VALIDATORS_APP_TOKEN`   | optional | Enriches validator metadata via validators.app           |
| `APP_URL`                | yes      | Public web URL — used for CORS and SIWS domain default   |
| `API_BASE_URL`           | optional | Web app uses this to point at a non-local API            |
| `CORS_ORIGIN`            | optional | Overrides `APP_URL` for CORS allow-list                  |
| `SIWS_DOMAIN`            | optional | Domain string included in the SIWS message               |
| `PORT`                   | optional | API port (default `3001`)                                |
| `LOG_LEVEL`              | optional | pino level: `trace`/`debug`/`info`/`warn`/`error`        |

Production uses Doppler — `doppler run -- pnpm dev` pulls secrets at runtime instead of `.env`.

---

## Database & migrations

Drizzle is the only ORM. Prisma is **not** used and never should be.

```bash
# Edit packages/db/src/schema/*.ts, then:
pnpm db:generate     # writes a new SQL migration to packages/db/drizzle/
pnpm db:migrate      # applies pending migrations to DATABASE_URL

# Inspect data
pnpm --filter=@get-toasted/db db:studio
```

Notes:

- The Drizzle client is configured with `prepare: false` because Neon's pooler / PgBouncer in transaction mode does not support prepared statements.
- Use the **direct** (unpooled) `DATABASE_URL` when running `db:migrate`, and the **pooled** URL at runtime.
- All amounts and slot numbers are `bigint`. Don't downcast to `number`.

---

## Queues & workers

| Queue               | Producer                                           | Consumer                            | Trigger          |
| ------------------- | -------------------------------------------------- | ----------------------------------- | ---------------- |
| `scan-historical`   | `apps/api` — `POST /api/v1/wallets/:address/scan` | `apps/workers/scanner`              | User request     |
| `scan-realtime`     | `apps/api` — `POST /api/webhooks/helius`           | `apps/workers/detector`             | Helius webhook   |
| `risk-score`        | BullMQ scheduler (cron)                            | `apps/workers/risk-analyzer`        | Cron             |
| `validator-refresh` | BullMQ scheduler (cron)                            | `apps/workers/validator-refresh`    | Cron             |

To run a single worker locally:

```bash
pnpm dev --filter=scanner
pnpm dev --filter=detector
pnpm dev --filter=risk-analyzer
pnpm dev --filter=validator-refresh
```

The detector heuristic lives **only** in `@get-toasted/core` — never duplicate it inside a worker.

---

## API surface

Mounted in `apps/api/src/index.ts`:

| Path                                | Purpose                                           |
| ----------------------------------- | ------------------------------------------------- |
| `GET  /health`                      | Liveness — returns `status`, `uptime`, `timestamp`|
| `POST /api/auth/...`                | SIWS challenge + verify, JWT issuance             |
| `GET  /api/v1/health`               | DB + Redis check                                  |
| `POST /api/v1/wallets/:address/scan`| Enqueue a historical scan                         |
| `GET  /api/v1/wallets/:address`     | Wallet summary, recent sandwiches                 |
| `GET  /api/v1/sandwiches/...`       | Per-sandwich detail                               |
| `GET  /api/v1/validators/...`       | Validator metadata                                |
| `GET  /api/v1/stats`                | Global aggregate stats                            |
| `GET  /api/v1/stream`               | Server-sent events for live detections            |
| `POST /api/v1/simulate`             | Dry-run the detector against arbitrary input      |
| `POST /api/webhooks/helius`         | HMAC-verified Helius webhook ingest               |

All routes validate input with `@hono/zod-validator`. CORS is locked to `APP_URL` / `CORS_ORIGIN` plus `http://localhost:3000`. Requests are rate-limited to 100/min per IP via Redis (webhooks excluded).

---

## Common scripts

Run from the repo root:

```bash
pnpm dev             # turbo dev (everything)
pnpm build           # turbo build (everything)
pnpm lint            # turbo lint
pnpm type-check      # turbo type-check
pnpm test            # turbo test
pnpm format          # prettier --write across the repo
pnpm db:generate     # drizzle-kit generate (filtered to @get-toasted/db)
pnpm db:migrate      # drizzle-kit migrate
```

Filter to a workspace:

```bash
pnpm <script> --filter=api
pnpm <script> --filter=web
pnpm <script> --filter=@get-toasted/core
```

---

## Deployment

| Service              | Platform | Root dir                          | Start                          |
| -------------------- | -------- | --------------------------------- | ------------------------------ |
| `web`                | Vercel   | `apps/web`                        | `pnpm --filter web build`      |
| `api`                | Railway  | `apps/api`                        | `pnpm start`                   |
| `worker-scanner`     | Railway  | `apps/workers/scanner`            | `pnpm start`                   |
| `worker-detector`    | Railway  | `apps/workers/detector`           | `pnpm start`                   |
| `worker-risk`        | Railway  | `apps/workers/risk-analyzer`      | `pnpm start`                   |
| `worker-validator`   | Railway  | `apps/workers/validator-refresh`  | `pnpm start`                   |

Database: **Neon** (pooled URL for runtime, direct for migrations).
Queue: **Upstash Redis** (Fixed 250 MB plan — not pay-as-you-go, since BullMQ + payg eviction policies do not mix).

A self-hosted Oracle Cloud path also exists — see `infra/scripts/setup-oracle.sh` and `infra/nginx/`.

---

## Project conventions

These are non-negotiable in this codebase:

- **ESM only** — every package sets `"type": "module"`.
- **`bigint` for token amounts and slot numbers** — never `number`.
- **Drizzle only** — no Prisma.
- **`@solana/kit` only** — avoid `@solana/web3.js` v1 unless a transitive dep forces it.
- **Zod v3.x** is pinned for `react-hook-form` resolver compatibility.
- **All Hono routes validate input** with `@hono/zod-validator`.
- **`prepare: false`** on the postgres-js client (Neon pooler requirement).
- **Detector heuristic lives only in `@get-toasted/core`** — workers import it.
- **`apps/docs` stays** — even when it looks unused.

---

## Troubleshooting

**`postgres connection failed` on API startup**
Check that `DATABASE_URL` points at a reachable Postgres and that migrations have run. On Neon, make sure the runtime URL is the **pooled** one (`...-pooler...`).

**`role "gettoasted" does not exist` from `pnpm db:migrate`**
You almost certainly have a native Postgres on your machine listening on port 5432, intercepting the connection meant for the Docker container. The Docker postgres is mapped to host port `5433` for this reason — confirm your `DATABASE_URL` ends in `:5433/gettoasted`, then re-run. Diagnose with `lsof -nP -iTCP:5432 -sTCP:LISTEN`.

**Migration fails with stale roles after changing `POSTGRES_USER`**
Postgres only honors `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` on a **fresh** data dir. If you changed any of those after the volume was first initialized, wipe it: `docker compose down -v && docker compose up -d postgres redis`.

**`Invalid environment variables` on api/worker startup**
The `@get-toasted/env` package walks up from `process.cwd()` looking for `.env`. Make sure a `.env` file exists at the repo root and that the variables it complains about are set. Wrapping `=value` in `"…"` is fine; embedding quotes mid-value (e.g. `?api-key="abc"`) will be sent literally and break URLs.

**`prepare statement does not exist` errors at runtime**
You're hitting Neon's pooler with prepared statements enabled. The shared client already sets `prepare: false`; if you've created your own postgres-js client, set the same flag.

**BullMQ jobs sit in `waiting` forever**
The corresponding worker isn't running. Start it with `pnpm dev --filter=<worker>` or `docker compose up <worker>`.

**Helius webhook returns 401**
`HELIUS_WEBHOOK_SECRET` mismatch between your `.env` and the secret configured on the Helius webhook.

**`pnpm install` complains about Node version**
This repo requires Node 20+. Use `nvm use 20` (or `fnm`, `volta`) and re-run.

**Port 3000/3001 already in use**
`apps/web` defaults to 3000 and `apps/api` to 3001. Override with `PORT` for the API, or `next dev --port` for the web app.

---

## License

Proprietary — all rights reserved [MIT]
