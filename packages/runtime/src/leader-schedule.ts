import type { Redis } from "ioredis";
import type { HeliusClient } from "@get-toasted/helius";
import { logger } from "./logger.js";
import { LEADER_SCHEDULE_TTL_SECONDS, redisKeys } from "./redis-keys.js";

const SLOTS_PER_EPOCH = 432_000n;

export function slotToEpoch(slot: bigint): number {
  return Number(slot / SLOTS_PER_EPOCH);
}

export function firstSlotOfEpoch(epoch: number): bigint {
  return BigInt(epoch) * SLOTS_PER_EPOCH;
}

export type LeaderScheduleCache = {
  getValidatorForSlot(slot: bigint): Promise<string | null>;
  hydrateEpoch(epoch: number): Promise<void>;
};

export function createLeaderScheduleCache(opts: {
  redis: Redis;
  helius: HeliusClient;
}): LeaderScheduleCache {
  const { redis, helius } = opts;

  const buildSlotMap = (
    schedule: Record<string, number[]>,
    firstSlot: bigint,
  ): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [identity, offsets] of Object.entries(schedule)) {
      for (const off of offsets) {
        const slot = firstSlot + BigInt(off);
        out[slot.toString()] = identity;
      }
    }
    return out;
  };

  const hydrateEpoch = async (epoch: number): Promise<void> => {
    const firstSlot = firstSlotOfEpoch(epoch);
    const schedule = await helius.getLeaderSchedule(firstSlot);
    if (Object.keys(schedule).length === 0) {
      logger.warn({ epoch }, "leader-schedule: empty schedule from RPC");
      return;
    }
    const map = buildSlotMap(schedule, firstSlot);
    await redis.set(
      redisKeys.leaderEpoch(epoch),
      JSON.stringify(map),
      "EX",
      LEADER_SCHEDULE_TTL_SECONDS,
    );
    logger.info(
      { epoch, slots: Object.keys(map).length },
      "leader-schedule: cached",
    );
  };

  const getValidatorForSlot = async (slot: bigint): Promise<string | null> => {
    const epoch = slotToEpoch(slot);
    const cacheKey = redisKeys.leaderEpoch(epoch);
    const cached = await redis.get(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as Record<string, string>;
        return parsed[slot.toString()] ?? null;
      } catch {
        await redis.del(cacheKey);
      }
    }
    try {
      await hydrateEpoch(epoch);
    } catch (err) {
      logger.warn({ err, epoch }, "leader-schedule: hydrate failed");
      return null;
    }
    const fresh = await redis.get(cacheKey);
    if (!fresh) return null;
    try {
      const parsed = JSON.parse(fresh) as Record<string, string>;
      return parsed[slot.toString()] ?? null;
    } catch {
      return null;
    }
  };

  return { getValidatorForSlot, hydrateEpoch };
}
