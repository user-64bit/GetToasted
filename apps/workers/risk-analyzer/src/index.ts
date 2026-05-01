import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";
import { serverEnv } from "@get-toasted/env";
import { createDb, Pools, Validators } from "@get-toasted/db";
import { createLogger } from "@get-toasted/runtime";

const log = createLogger({ worker: "risk-analyzer" });

const connection = new IORedis(serverEnv.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});
const db = createDb(serverEnv.DATABASE_URL);

const scheduler = new Queue("risk-score", { connection });
await scheduler.upsertJobScheduler(
  "risk-score-hourly",
  { every: 60 * 60 * 1000 },
  { name: "sweep" },
);

const worker = new Worker(
  "risk-score",
  async () => {
    const startedAt = Date.now();
    const poolsTouched = await Pools.recomputePoolRiskScores(db);
    const validatorsTouched = await Validators.recomputeValidatorSandwichStats(db);
    log.info(
      {
        poolsTouched,
        validatorsTouched,
        durationMs: Date.now() - startedAt,
      },
      "risk-analyzer: sweep complete",
    );
    return { poolsTouched, validatorsTouched };
  },
  { connection, concurrency: 1 },
);

worker.on("ready", () => log.info("risk-analyzer: ready"));
worker.on("failed", (job, err) =>
  log.error({ jobId: job?.id, err }, "risk-analyzer: job failed"),
);

const shutdown = async (signal: string) => {
  log.info({ signal }, "risk-analyzer: shutting down");
  await worker.close();
  await scheduler.close();
  connection.disconnect();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

log.info("risk-analyzer: worker up — queue: risk-score");
