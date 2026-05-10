# `@get-toasted/detector-harness`

CLI for validating, debugging, and mining ground truth for the
production sandwich detector.

This harness is a **workspace package** — it imports
`detectSandwichesForWalletSwaps` from `@get-toasted/core` directly, so
validating the harness validates production. There is no fork.

## Install + run

```bash
pnpm install
cp .env.example .env  # set HELIUS_API_KEY
pnpm harness <command> [args]
```

The `harness` script lives in the repo-root `package.json`; you can
run it from anywhere.

## Validation

The two commands you'll use 99% of the time.

### Mine Jito-bundle ground truth

```bash
pnpm harness mine-from-known-bots \
  --bots <signer> \
  --limit <N> \
  --scan-limit <M>
```

Walks `<signer>`'s last `M` signatures, looks up each via
`bundles.jito.wtf/api/v1/bundles/transaction/{sig}`, and emits
mechanically-confirmed (victim wallet, slot, victim sig) tuples to
`research/mined-victims/known-bots-<timestamp>.json`. Stops at `N`
unique victims.

`--bots` accepts a comma-separated list. To mine across the registry
(`packages/core/src/known-bots.ts`), omit `--bots`.

### Validate a mined ground-truth set

```bash
pnpm harness validate-mined research/mined-victims/known-bots-<timestamp>.json
```

For each tuple, expands the slot via the production block-expander
pipeline, runs `detectSandwichesForWalletSwaps`, and reports
`HIT`/`MISS` with the layer + confidence. Writes a structured report
to `research/validation-runs/mined-validation-<timestamp>.json`.

The 30/30 result documented in `research/validation-report.md` is
reproducible from these two commands.

## Diagnostics

When a known-good case isn't being detected and you need to see why.

### `validate-wallet <wallet> [--limit 500]`

Pulls the wallet's recent signatures, expands every slot, runs the
production detector against every wallet swap, and reports:

- detections found vs. ground truth from Jito bundles
- per-detection layer + confidence + matched-ground-truth flag
- per-wallet-swap context (pool, dex, jito-bundled, same-slot/same-pool
  candidate counts)

Useful for understanding "is this wallet being sandwiched right now,
and is the detector flagging it?".

### `diagnose-slot <wallet> <slot>`

Deep per-slot dump for a single victim swap: every same-pool candidate
with its signer / direction / index, every distinct non-victim signer,
and a manual walk through L1/L2/L3/L4 evaluation showing why each layer
did or did not fire.

This is the right tool when `validate-mined` reports MISS or
`validate-wallet` reports zero detections on a slot you expected
otherwise.

### `debug-miss <wallet> <slot>` / `debug-extra <wallet> <slot>`

Wrappers around `validate-wallet` filtered to a single slot.
`debug-miss` lists ground-truth victims that the detector skipped;
`debug-extra` lists detector hits that have no ground-truth confirmation
(useful when the detector flags something Jito didn't bundle, e.g. a
candidate L4 statistical hit).

## Legacy fixture authoring (rarely needed)

The harness predates the Jito-mining workflow above. Several commands
exist for authoring fixture JSON files under `tests/detector/fixtures/`.
The fixture corpus is **gitignored** (~500 MB of full-block snapshots);
regenerate locally only if you need it.

```bash
pnpm harness analyze <signature> [--write-fixture]
pnpm harness analyze-block <slot> [--bundle-id <id>]
pnpm harness analyze-window <fromSlot> <toSlot>
pnpm harness analyze-wallet <wallet> [--limit 50]

pnpm harness discover-signer-positives <signer> [--source <label>] [--limit 3] [--scan-limit 1000] [--allow-associated]
pnpm harness discover-recent-bundle-positives jito [--limit 6] [--scan-limit 500]

pnpm harness bootstrap-a-guard <filtered_sandwitches.json> [--limit 14]
pnpm harness bootstrap-a-guard-edges <filtered_sandwitches.json> [--limit 5]
pnpm harness bootstrap-arbitrage-negatives <currency_mint> [--limit 10]

pnpm harness refresh-fixtures all
pnpm harness validate-fixtures all
```

These commands use a **legacy harness-local detector**
(`tools/detector-harness/src/detector.ts`) preserved for fixture
authoring only. They do **not** validate production. For production
validation use `validate-mined` / `validate-wallet`.

## Environment

Reads from the repo-root `.env` (loaded by `tools/detector-harness/src/env.ts`):

- `HELIUS_API_KEY` (required) — for Helius enhanced + RPC.
- `HELIUS_RPC_URL` (optional) — overrides the default mainnet RPC URL.

No Postgres or Redis required — the harness is read-only against
upstream APIs and the local filesystem.
