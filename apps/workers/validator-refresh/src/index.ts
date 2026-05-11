import { Worker, Queue } from "bullmq";
import IORedis from "ioredis";
import { serverEnv } from "@get-toasted/env";
import { HeliusClient } from "@get-toasted/helius";
import { createDb, Validators } from "@get-toasted/db";

type ValidatorInsert = Validators.ValidatorInsert;
import {
  createLeaderScheduleCache,
  createLogger,
} from "@get-toasted/runtime";

const log = createLogger({ worker: "validator-refresh" });

const connection = new IORedis(serverEnv.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});
const helper = new IORedis(serverEnv.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const helius = new HeliusClient(
  serverEnv.HELIUS_API_KEY,
  serverEnv.HELIUS_RPC_URL,
);
const db = createDb(serverEnv.DATABASE_URL);
const leader = createLeaderScheduleCache({ redis: helper, helius });

const scheduler = new Queue("validator-refresh", { connection });
await scheduler.upsertJobScheduler(
  "validator-refresh-daily",
  { every: 24 * 60 * 60 * 1000 },
  { name: "sweep" },
);

type ValidatorsAppEntry = {
  vote_account?: string;
  account?: string;
  name?: string;
  commission?: number;
  activated_stake?: number;
  is_jito_validator?: boolean;
};

type StakewizEntry = {
  vote_identity?: string;
  identity?: string;
  jito_commission_bps?: number | null;
  is_jito?: boolean;
};

async function fetchValidatorsApp(): Promise<ValidatorsAppEntry[]> {
  if (!serverEnv.VALIDATORS_APP_TOKEN) {
    log.warn("validators.app: token missing — skipping fetch");
    return [];
  }
  try {
    const res = await fetch(
      "https://www.validators.app/api/v1/validators/mainnet.json?limit=500&order=activated_stake",
      { headers: { Token: serverEnv.VALIDATORS_APP_TOKEN } },
    );
    if (!res.ok) {
      log.warn({ status: res.status }, "validators.app: non-200");
      return [];
    }
    return (await res.json()) as ValidatorsAppEntry[];
  } catch (err) {
    log.warn({ err }, "validators.app: fetch failed");
    return [];
  }
}

async function fetchStakewiz(): Promise<Map<string, StakewizEntry>> {
  try {
    const res = await fetch("https://api.stakewiz.com/validators");
    if (!res.ok) return new Map();
    const list = (await res.json()) as StakewizEntry[];
    const out = new Map<string, StakewizEntry>();
    for (const entry of list) {
      const key = entry.vote_identity ?? entry.identity;
      if (key) out.set(key, entry);
    }
    return out;
  } catch (err) {
    log.warn({ err }, "stakewiz: fetch failed");
    return new Map();
  }
}

const worker = new Worker(
  "validator-refresh",
  async () => {
    const startedAt = Date.now();

    const [validatorsApp, stakewiz] = await Promise.all([
      fetchValidatorsApp(),
      fetchStakewiz(),
    ]);

    const merged: ValidatorInsert[] = [];
    for (const v of validatorsApp) {
      const voteAccount = v.vote_account ?? v.account;
      if (!voteAccount) continue;
      const sw = stakewiz.get(voteAccount);
      merged.push({
        voteAccount,
        identityAccount: voteAccount,
        name: v.name ?? null,
        activatedStake:
          v.activated_stake !== undefined ? String(Math.floor(v.activated_stake)) : null,
        commission: v.commission ?? null,
        isJitoEnabled: v.is_jito_validator ?? sw?.is_jito ?? false,
        metadata: {
          source: "validators.app+stakewiz",
          jitoCommissionBps: sw?.jito_commission_bps ?? null,
        },
      });
    }

    if (merged.length > 0) {
      await Validators.upsertValidatorBatch(db, merged);
    }

    await Validators.recomputeValidatorSandwichStats(db);

    let epochCached = 0;
    try {
      const epochInfo = await helius.getEpochInfo();
      await leader.hydrateEpoch(epochInfo.epoch);
      epochCached = epochInfo.epoch;
    } catch (err) {
      log.warn({ err }, "validator-refresh: leader schedule hydrate failed");
    }

    log.info(
      {
        validators: merged.length,
        epochCached,
        durationMs: Date.now() - startedAt,
      },
      "validator-refresh: sweep complete",
    );
    return { refreshed: merged.length, epoch: epochCached };
  },
  { connection, concurrency: 1 },
);

worker.on("ready", () => log.info("validator-refresh: ready"));
worker.on("failed", (job, err) =>
  log.error({ jobId: job?.id, err }, "validator-refresh: job failed"),
);

const shutdown = async (signal: string) => {
  log.info({ signal }, "validator-refresh: shutting down");
  await worker.close();
  await scheduler.close();
  connection.disconnect();
  helper.disconnect();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  log.error({ err: reason }, "validator-refresh: unhandledRejection");
});
process.on("uncaughtException", (err) => {
  log.error({ err }, "validator-refresh: uncaughtException");
});

log.info("validator-refresh: worker up — queue: validator-refresh");
