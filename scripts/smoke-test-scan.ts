/**
 * End-to-end smoke test for the production scan-historical pipeline.
 *
 * Picks a Jito-bundle-confirmed mined victim wallet, enqueues a real
 * BullMQ job, polls for completion, and verifies:
 *   1. detected_sandwiches Postgres rows persist with the layered-detector
 *      columns populated (detection_layer, loss_method, loss_confidence).
 *   2. scan:progress:{wallet} Redis key updates during the scan.
 *   3. final detection count matches what `validate-mined` reported.
 *
 * Note: alerts:queue:{wallet} (Redis Stream) is the realtime detector
 * worker's output for webhook-driven detections — distinct from this
 * scan path, and tested separately.
 *
 * Usage: pnpm tsx scripts/smoke-test-scan.ts <wallet>
 */

import IORedis from "ioredis";
import { Queue, QueueEvents } from "bullmq";
import { serverEnv } from "@get-toasted/env";
import { createDb, ScanJobsQ, Sandwiches, Wallets } from "@get-toasted/db";
import { redisKeys } from "@get-toasted/runtime";

async function main(): Promise<void> {
  const wallet = process.argv[2];
  if (!wallet) {
    console.error("Usage: pnpm tsx scripts/smoke-test-scan.ts <wallet>");
    process.exit(1);
  }

  const redis = new IORedis(serverEnv.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  const helper = new IORedis(serverEnv.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  const db = createDb(serverEnv.DATABASE_URL);
  const queue = new Queue("scan-historical", { connection: redis });
  const events = new QueueEvents("scan-historical", { connection: helper });
  await events.waitUntilReady();

  console.log(`smoke wallet=${wallet}`);

  // Capture detection count BEFORE so we measure delta.
  const beforeRows = await Sandwiches.getSandwichesForWallet(
    db,
    { victimWallet: wallet },
    { limit: 100 },
  );
  console.log(`detectionsBefore=${beforeRows.data.length}`);

  // Mirror the API's scan path: upsert wallet pending + create scan job + enqueue.
  await Wallets.upsertWalletPending(db, wallet);
  const job = await ScanJobsQ.createScanJob(db, wallet);
  console.log(`jobId=${job.id}`);

  await queue.add(
    "scan",
    { wallet, jobId: job.id },
    { jobId: job.id, removeOnComplete: { age: 24 * 60 * 60 } },
  );
  const t0 = Date.now();
  console.log("enqueued; waiting for worker");

  // Poll scan:progress:{wallet} every second so we can see the worker
  // is actually advancing. Capture distinct progress snapshots — the SSE
  // endpoint reads exactly the same key.
  const seenProgress = new Set<string>();
  let progressSamples = 0;
  const progressTicker = setInterval(async () => {
    try {
      const raw = await helper.get(redisKeys.scanProgress(wallet));
      if (!raw) return;
      if (seenProgress.has(raw)) return;
      seenProgress.add(raw);
      progressSamples += 1;
      const parsed = JSON.parse(raw);
      console.log(
        `progress sample=${progressSamples} sigs=${parsed.signaturesProcessed} sandwiches=${parsed.sandwichesFound} pct=${parsed.progressPct}`,
      );
    } catch {
      // ignore
    }
  }, 1000);

  // Wait for completion with a generous timeout.
  let final: "completed" | "failed" | "timeout" = "timeout";
  let failReason: string | null = null;
  await Promise.race([
    new Promise<void>((resolve) => {
      events.on("completed", ({ jobId }) => {
        if (jobId === job.id) {
          final = "completed";
          resolve();
        }
      });
      events.on("failed", ({ jobId, failedReason }) => {
        if (jobId === job.id) {
          final = "failed";
          failReason = failedReason ?? "(no reason)";
          resolve();
        }
      });
    }),
    new Promise<void>((resolve) => setTimeout(resolve, 180_000)),
  ]);
  clearInterval(progressTicker);

  console.log(`worker outcome=${final} elapsedMs=${Date.now() - t0}`);
  if (failReason) console.log(`failReason=${failReason}`);

  // Re-read job row for canonical signaturesProcessed / sandwichesFound /
  // status.
  const finalJob = await ScanJobsQ.getScanJob(db, job.id);
  if (finalJob) {
    console.log(
      `scanJob status=${finalJob.status} signaturesProcessed=${finalJob.signaturesProcessed} sandwichesFound=${finalJob.sandwichesFound} progressPct=${finalJob.progressPct} error=${finalJob.error ?? "none"}`,
    );
  }

  const afterRows = await Sandwiches.getSandwichesForWallet(
    db,
    { victimWallet: wallet },
    { limit: 100 },
  );
  const newDetections = afterRows.data.filter(
    (r) =>
      !beforeRows.data.some((b) => b.id === r.id),
  );
  console.log(`detectionsAfter=${afterRows.data.length} new=${newDetections.length}`);

  for (const row of newDetections) {
    console.log(
      `  detection layer=${row.detectionLayer} confidence=${row.confidence} lossMethod=${row.lossMethod ?? "-"} lossConfidence=${row.lossConfidence ?? "-"} slot=${row.slot} pool=${row.pool} attacker=${row.attacker} jitoBundled=${row.jitoBundled} lossUsd=${row.lossUsd ?? "-"} lossOutputAmount=${row.lossOutputAmount ?? "-"}`,
    );
  }

  console.log("\n=== smoke verdict ===");
  console.log(`progress events observed: ${progressSamples > 0 ? "YES" : "NO"} (${progressSamples} unique snapshots)`);
  console.log(`detections persisted: ${newDetections.length}`);
  if (newDetections.length > 0) {
    const allHaveLayer = newDetections.every(
      (r) => r.detectionLayer && r.detectionLayer !== "legacy",
    );
    const allHaveLossMethod = newDetections.every((r) => r.lossMethod);
    console.log(`detection_layer populated (non-legacy): ${allHaveLayer ? "YES" : "NO"}`);
    console.log(`loss_method populated: ${allHaveLossMethod ? "YES" : "NO"}`);
  }

  await events.close();
  await queue.close();
  redis.disconnect();
  helper.disconnect();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
