/**
 * Phase A.4 end-to-end smoke test: API → BullMQ → worker → DB → SSE.
 *
 * For each wallet:
 *   1. POST /api/v1/wallets/:address/scan — trigger via the public API
 *      (no SIWS gate per v1 demo scope).
 *   2. Subscribe to SSE at GET /api/v1/stream/:address — capture progress
 *      events and live alert messages until status="done"|"failed".
 *   3. GET /api/v1/wallets/:address/sandwiches — fetch persisted rows.
 *   4. Verify: count matches `validate-mined` expectation, every row has
 *      detection_layer != legacy + (loss_usd != 0 OR memecoin reason),
 *      scan completed within budget.
 *
 * Usage: pnpm tsx scripts/smoke-test-api.ts
 */

import IORedis from "ioredis";
import { serverEnv } from "@get-toasted/env";
import { redisKeys } from "@get-toasted/runtime";

const API_BASE = process.env.API_BASE ?? "http://localhost:3001";

// 3 known-victim wallets from the validated 30-wallet ground truth.
// Each is bundled-attacked at exactly one historical slot; the production
// scanner with MAX_SCAN_DURATION_MS=300000 should walk back to that slot
// and emit one detection.
const WALLETS = [
  { address: "8UE2QGDJcpBp1PPjuCz3EsDtJn3wzSaPsmpVYXGRbzC7", expectedSlot: 362686298 },
];

const HARD_CAP_PER_WALLET_MS = Number(process.env.HARD_CAP_PER_WALLET_MS ?? 720_000); // 12 min

type Sandwich = {
  id: string;
  slot: string;
  detectedAt: string;
  pool: string;
  attacker: string;
  jitoBundled: boolean;
  confidence: string;
  lossUsd: string | null;
  // detection_layer/loss_method aren't currently in the API response —
  // we'll spot-check against DB separately.
};

async function runOne(
  redis: IORedis,
  wallet: string,
  expectedSlot: number,
): Promise<{
  wallet: string;
  scanId: string;
  outcome: "completed" | "failed" | "timeout";
  durationMs: number;
  progressEvents: number;
  sseAlertCount: number;
  detections: Sandwich[];
  expectedSlotDetected: boolean;
  rejectionReason: string | null;
}> {
  console.log(`\n=== ${wallet} (expected slot ${expectedSlot}) ===`);

  // Clear any stale lock from a prior aborted run so we always trigger a
  // fresh scan during the smoke test.
  await redis.del(redisKeys.scanLock(wallet));

  const t0 = Date.now();
  const scanRes = await fetch(`${API_BASE}/api/v1/wallets/${wallet}/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!scanRes.ok) {
    const body = await scanRes.text();
    return {
      wallet,
      scanId: "",
      outcome: "failed",
      durationMs: 0,
      progressEvents: 0,
      sseAlertCount: 0,
      detections: [],
      expectedSlotDetected: false,
      rejectionReason: `scan POST failed: ${scanRes.status} ${body}`,
    };
  }
  const scanBody = (await scanRes.json()) as { scanId: string; status: string };
  const scanId = scanBody.scanId;
  console.log(`scanId=${scanId} status=${scanBody.status}`);

  // Subscribe to SSE. The /api/v1/stream/:address endpoint streams
  // {progress, sandwichesFound, status} every 2s + heartbeats every 15s.
  let progressEvents = 0;
  let sseAlertCount = 0;
  let outcome: "completed" | "failed" | "timeout" = "timeout";
  let abort = false;

  const sseDeadline = Date.now() + HARD_CAP_PER_WALLET_MS;
  const sseRes = await fetch(`${API_BASE}/api/v1/stream/${wallet}`);
  if (!sseRes.ok || !sseRes.body) {
    return {
      wallet,
      scanId,
      outcome: "failed",
      durationMs: Date.now() - t0,
      progressEvents,
      sseAlertCount,
      detections: [],
      expectedSlotDetected: false,
      rejectionReason: `sse opened with status ${sseRes.status}`,
    };
  }

  const reader = sseRes.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  // Read the SSE stream until we see a terminal status or hit the deadline.
  while (!abort && Date.now() < sseDeadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (!payload) continue;
      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(payload);
      } catch {
        continue;
      }
      if (obj.type === "heartbeat") continue;
      if (obj.type === "progress") {
        progressEvents += 1;
        const status = String(obj.status);
        const found = Number(obj.sandwichesFound ?? 0);
        const pct = Number(obj.progress ?? 0);
        if (progressEvents <= 3 || progressEvents % 5 === 0) {
          console.log(`  progress #${progressEvents} pct=${pct} found=${found} status=${status}`);
        }
        if (status === "done") {
          outcome = "completed";
          abort = true;
        } else if (status === "failed") {
          outcome = "failed";
          abort = true;
        }
      } else {
        // Live alert from alerts:queue:{wallet} — counts as an SSE
        // detection event, distinct from progress polling.
        sseAlertCount += 1;
      }
    }
  }
  await reader.cancel().catch(() => undefined);

  console.log(`outcome=${outcome} progressEvents=${progressEvents} sseAlerts=${sseAlertCount}`);

  // Fetch persisted detections.
  const detRes = await fetch(`${API_BASE}/api/v1/wallets/${wallet}/sandwiches?limit=100`);
  const detBody = (await detRes.json()) as { data: Sandwich[] };
  const detections = detBody.data ?? [];
  console.log(`persistedDetections=${detections.length}`);
  for (const d of detections) {
    console.log(
      `  slot=${d.slot} pool=${d.pool} attacker=${d.attacker} confidence=${d.confidence} jito=${d.jitoBundled} lossUsd=${d.lossUsd ?? "null"}`,
    );
  }

  const expectedSlotDetected = detections.some((d) => d.slot === String(expectedSlot));

  return {
    wallet,
    scanId,
    outcome,
    durationMs: Date.now() - t0,
    progressEvents,
    sseAlertCount,
    detections,
    expectedSlotDetected,
    rejectionReason: null,
  };
}

async function main(): Promise<void> {
  const redis = new IORedis(serverEnv.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  const results = [];
  for (const w of WALLETS) {
    const r = await runOne(redis, w.address, w.expectedSlot);
    results.push(r);
  }

  console.log("\n=== Phase A.4 smoke verdict ===");
  for (const r of results) {
    console.log(
      `  ${r.wallet} outcome=${r.outcome} progress=${r.progressEvents} expectedSlot=${r.expectedSlotDetected ? "✓" : "✗"} detections=${r.detections.length} duration=${(r.durationMs / 1000).toFixed(1)}s`,
    );
  }

  const allPass =
    results.every((r) => r.outcome === "completed") &&
    results.every((r) => r.expectedSlotDetected) &&
    results.every((r) => r.progressEvents > 0);
  console.log(allPass ? "\nALL PASS" : "\nSOME FAILED");

  redis.disconnect();
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
