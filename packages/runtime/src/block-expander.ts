import type { Redis } from "ioredis";
import {
  TRACKED_DEX_PROGRAM_ID_SET,
  type ParsedSwap,
} from "@get-toasted/core";
import {
  parseHeliusTxToSwaps,
  type HeliusBlockInstruction,
  type HeliusBlockTransaction,
  type HeliusClient,
  type HeliusEnhancedTransaction,
} from "@get-toasted/helius";
import { logger as rootLogger, type Logger } from "./logger.js";
import {
  BLOCK_SWAPS_LOCK_TTL_SECONDS,
  BLOCK_SWAPS_MISSING_TTL_SECONDS,
  BLOCK_SWAPS_TTL_SECONDS,
  redisKeys,
} from "./redis-keys.js";

/**
 * BlockExpander — turns a slot number into the full set of `ParsedSwap`s
 * for every tracked-DEX swap in that block, ordered by their true position
 * in the block. Required for sandwich detection: detection is a windowed
 * triple-match (front/victim/back) on swaps grouped by `(slot, pool)`, so
 * the detector can never see a sandwich if it's only fed the victim's swap.
 *
 * Pipeline (per slot):
 *   1. Try Redis cache — finalized slots are immutable, so we cache
 *      aggressively (14d) plus a negative cache for skipped slots.
 *   2. Acquire a short-lived per-slot lock so parallel workers don't all
 *      issue getBlock for the same slot.
 *   3. `getBlock` (RPC, jsonParsed, transactionDetails: "full") — gives us
 *      every tx in the block with account keys + outer instructions, which
 *      is enough to filter to txs that touch one of our tracked DEX
 *      program ids without an extra Helius round trip.
 *   4. Helius enhanced `parseTransactions` on the filtered signatures, in
 *      chunks of 100 (the API's hard limit). Enhanced output is what gives
 *      us the structured `events.swap` (token amounts, mints, decimals).
 *   5. Parse each enhanced tx with the *true* `txIndexInBlock` and emit a
 *      flat `ParsedSwap[]` sorted by that index.
 *
 * Anti-footgun notes for future maintainers:
 *   - The detector relies on `txIndexInBlock` to order front/victim/back.
 *     Don't fall back to the array-position-based default in the parser
 *     here — always pass the real index.
 *   - We cache the *output* (parsed swaps), not the raw block. Reparsing
 *     every read would defeat the cache.
 *   - bigints serialize as strings; Dates as ISO. The helpers below are
 *     symmetric with the in-memory shape so callers don't need to know.
 *   - Helius enhanced may return < N entries when some signatures aren't
 *     parseable. We re-attach the original block index by signature, so
 *     missing entries are skipped silently rather than misordered.
 */

export type BlockExpander = ReturnType<typeof createBlockExpander>;

type Opts = {
  redis: Redis;
  helius: HeliusClient;
  logger?: Logger;
};

const PARSE_BATCH_SIZE = 100;

export function createBlockExpander(opts: Opts) {
  const { redis, helius } = opts;
  const log = (opts.logger ?? rootLogger).child({ component: "block-expander" });

  /**
   * Returns parsed swaps for every tracked-DEX swap in `slot`, in true
   * block order. Empty array means "we looked and there were none" (or
   * the block was skipped) — distinct from a cache miss.
   */
  async function getBlockSwaps(slot: bigint): Promise<ParsedSwap[]> {
    const cacheKey = redisKeys.blockSwaps(slot);
    const missingKey = redisKeys.blockSwapsMissing(slot);

    const [cached, missing] = await redis.mget(cacheKey, missingKey);
    if (cached) {
      const parsed = safeDeserialize(cached);
      if (parsed) return parsed;
      // Corrupt cache entry — drop and refetch.
      await redis.del(cacheKey);
    }
    if (missing) return [];

    const lockKey = redisKeys.blockSwapsLock(slot);
    const lockToken = `${process.pid}:${Date.now()}:${Math.random()}`;
    const acquired = await redis.set(
      lockKey,
      lockToken,
      "EX",
      BLOCK_SWAPS_LOCK_TTL_SECONDS,
      "NX",
    );

    if (!acquired) {
      // Another worker is already fetching this slot. Brief wait + re-read
      // cache. We don't block forever — if the holder dies, the lock TTL
      // releases and the next caller retries the full path.
      await sleep(200);
      const after = await redis.get(cacheKey);
      if (after) {
        const parsed = safeDeserialize(after);
        if (parsed) return parsed;
      }
      const missingAfter = await redis.get(missingKey);
      if (missingAfter) return [];
      // Fall through and fetch ourselves anyway — better a duplicate fetch
      // than silently returning nothing.
    }

    try {
      const swaps = await fetchAndParseSlot(slot);
      if (swaps === null) {
        // Block was skipped / pruned — negative cache.
        await redis.set(
          missingKey,
          "1",
          "EX",
          BLOCK_SWAPS_MISSING_TTL_SECONDS,
        );
        return [];
      }

      await redis.set(
        cacheKey,
        serialize(swaps),
        "EX",
        BLOCK_SWAPS_TTL_SECONDS,
      );
      return swaps;
    } catch (err) {
      log.warn(
        { err, slot: slot.toString() },
        "block-expander: fetch failed — caller will retry",
      );
      // Don't poison the cache on transient errors; just return empty so
      // the scanner can continue with other slots. The caller logs and
      // moves on; the next scan run will retry.
      return [];
    } finally {
      // Only release the lock if we still hold it. Cheap CAS via Lua.
      await redis
        .eval(
          `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
          1,
          lockKey,
          lockToken,
        )
        .catch(() => undefined);
    }
  }

  async function fetchAndParseSlot(slot: bigint): Promise<ParsedSwap[] | null> {
    const block = await helius.getBlock(slot);
    if (!block) return null;

    const txs = block.transactions ?? [];

    // Walk the block once. Build:
    //  - candidates: signatures whose outer or inner instructions reference
    //    a tracked DEX program. These get sent to Helius enhanced.
    //  - sigToIndex: true block position keyed by signature, so we can
    //    reattach `txIndexInBlock` after the enhanced round trip.
    const candidates: string[] = [];
    const sigToIndex = new Map<string, number>();

    for (let i = 0; i < txs.length; i++) {
      const blockTx = txs[i];
      if (!blockTx) continue;

      const sig = blockTx.transaction?.signatures?.[0];
      if (!sig) continue;

      sigToIndex.set(sig, i);

      if (touchesTrackedDex(blockTx)) {
        candidates.push(sig);
      }
    }

    if (candidates.length === 0) return [];

    // Helius enhanced caps at 100 sigs per call. Batch sequentially —
    // parallelism here gains us nothing because the underlying token
    // bucket is shared, and serializing keeps memory pressure flat.
    const enriched: HeliusEnhancedTransaction[] = [];
    for (let i = 0; i < candidates.length; i += PARSE_BATCH_SIZE) {
      const chunk = candidates.slice(i, i + PARSE_BATCH_SIZE);
      const batch = await helius.parseTransactions(chunk);
      for (const tx of batch) enriched.push(tx);
    }

    const out: ParsedSwap[] = [];
    for (const tx of enriched) {
      const trueIndex = sigToIndex.get(tx.signature);
      if (trueIndex === undefined) continue; // Shouldn't happen; defensive.
      const parsed = parseHeliusTxToSwaps(tx, { txIndexInBlock: trueIndex });
      for (const ps of parsed) out.push(ps);
    }

    out.sort((a, b) => a.txIndexInBlock - b.txIndexInBlock);

    log.debug(
      {
        slot: slot.toString(),
        blockTxCount: txs.length,
        candidateCount: candidates.length,
        parsedSwaps: out.length,
      },
      "block-expander: slot expanded",
    );

    return out;
  }

  return {
    getBlockSwaps,
    /**
     * Convenience for the scanner: expand a set of slots, returning a flat
     * `ParsedSwap[]` across all of them. Slots are processed sequentially to
     * keep within Helius's rate limit; parallelism would just stall on the
     * same token bucket inside HeliusClient.
     */
    async getSwapsForSlots(slots: Iterable<bigint>): Promise<ParsedSwap[]> {
      const unique = new Set<string>();
      const ordered: bigint[] = [];
      for (const s of slots) {
        const k = s.toString();
        if (unique.has(k)) continue;
        unique.add(k);
        ordered.push(s);
      }

      const all: ParsedSwap[] = [];
      for (const slot of ordered) {
        const swaps = await getBlockSwaps(slot);
        for (const s of swaps) all.push(s);
      }
      return all;
    },
  };
}

function touchesTrackedDex(tx: HeliusBlockTransaction): boolean {
  const message = tx.transaction?.message;
  if (!message) return false;

  if (instructionsHitTrackedDex(message.instructions ?? [])) return true;

  // jsonParsed encoding may surface inner instructions under meta. CPI
  // routes (Jupiter, aggregators) live there, so we MUST check them — the
  // outer ix is usually the router, not the DEX itself.
  for (const group of tx.meta?.innerInstructions ?? []) {
    if (instructionsHitTrackedDex(group.instructions ?? [])) return true;
  }

  return false;
}

function instructionsHitTrackedDex(ixs: HeliusBlockInstruction[]): boolean {
  for (const ix of ixs) {
    const pid = ix.programId;
    if (typeof pid === "string" && TRACKED_DEX_PROGRAM_ID_SET.has(pid)) {
      return true;
    }
  }
  return false;
}

type SerializedSwap = Omit<
  ParsedSwap,
  "slot" | "blockTime" | "inputAmount" | "outputAmount" | "jitoTipLamports"
> & {
  slot: string;
  blockTime: string;
  inputAmount: string;
  outputAmount: string;
  jitoTipLamports: string | null;
};

function serialize(swaps: ParsedSwap[]): string {
  const payload: SerializedSwap[] = swaps.map((s) => ({
    ...s,
    slot: s.slot.toString(),
    blockTime: s.blockTime.toISOString(),
    inputAmount: s.inputAmount.toString(),
    outputAmount: s.outputAmount.toString(),
    jitoTipLamports: s.jitoTipLamports === null ? null : s.jitoTipLamports.toString(),
  }));
  return JSON.stringify(payload);
}

function safeDeserialize(raw: string): ParsedSwap[] | null {
  try {
    const arr = JSON.parse(raw) as SerializedSwap[];
    if (!Array.isArray(arr)) return null;
    return arr.map((s) => ({
      ...s,
      slot: BigInt(s.slot),
      blockTime: new Date(s.blockTime),
      inputAmount: BigInt(s.inputAmount),
      outputAmount: BigInt(s.outputAmount),
      jitoTipLamports: s.jitoTipLamports === null ? null : BigInt(s.jitoTipLamports),
    }));
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
