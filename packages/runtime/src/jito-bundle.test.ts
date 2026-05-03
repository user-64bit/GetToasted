import { describe, expect, it, vi } from "vitest";
import type { Redis } from "ioredis";
import {
  createJitoBundleClient,
  createInMemoryJitoBundleClient,
} from "./jito-bundle.js";

function makeFakeRedis() {
  const store = new Map<string, string>();
  const fake: Partial<Redis> = {
    get: vi.fn(async (k: string) => store.get(k) ?? null) as unknown as Redis["get"],
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return "OK";
    }) as unknown as Redis["set"],
    del: vi.fn(async (k: string) => {
      const had = store.has(k);
      store.delete(k);
      return had ? 1 : 0;
    }) as unknown as Redis["del"],
  };
  return { redis: fake as Redis, store };
}

describe("createInMemoryJitoBundleClient", () => {
  it("returns the bundle for any signature contained in it", async () => {
    const client = createInMemoryJitoBundleClient([
      {
        bundleId: "B1",
        signaturesInBundle: ["a", "b", "c"],
        landedSlot: 100,
        tipLamports: 50_000n,
      },
    ]);
    const bundle = await client.getBundleForTx("b");
    expect(bundle).not.toBeNull();
    expect(bundle!.bundleId).toBe("B1");
    expect(bundle!.tipLamports).toBe(50_000n);
  });

  it("returns null for unknown signatures", async () => {
    const client = createInMemoryJitoBundleClient([]);
    expect(await client.getBundleForTx("nope")).toBeNull();
  });
});

describe("createJitoBundleClient", () => {
  it("hits the API once and caches the hit, returning bigint tipLamports", async () => {
    const { redis, store } = makeFakeRedis();
    const fetchFn = vi.fn(async () =>
      new Response(
        JSON.stringify({
          bundle_id: "B1",
          transactions: ["sigA", "sigB", "sigC"],
          landed_slot: 200,
          landed_tip_lamports: 75_000,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const client = createJitoBundleClient({
      redis,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const a = await client.getBundleForTx("sigB");
    expect(a).not.toBeNull();
    expect(a!.bundleId).toBe("B1");
    expect(a!.tipLamports).toBe(75_000n);
    expect(a!.landedSlot).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Second call hits the cache — fetch not called again, bigint round-trips.
    const b = await client.getBundleForTx("sigB");
    expect(b).not.toBeNull();
    expect(b!.tipLamports).toBe(75_000n);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Cache key written.
    expect(store.has("jito:bundle:sig:sigB")).toBe(true);
  });

  it("caches negative results so we don't re-query the API for misses", async () => {
    const { redis } = makeFakeRedis();
    const fetchFn = vi.fn(async () => new Response("", { status: 404 }));
    const client = createJitoBundleClient({
      redis,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(await client.getBundleForTx("missing")).toBeNull();
    expect(await client.getBundleForTx("missing")).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("returns null when the API call throws (fail-closed for L1)", async () => {
    const { redis } = makeFakeRedis();
    const fetchFn = vi.fn(async () => {
      throw new Error("ENETUNREACH");
    });
    const client = createJitoBundleClient({
      redis,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(await client.getBundleForTx("sig")).toBeNull();
  });

  it("treats non-2xx + non-404 responses as misses", async () => {
    const { redis } = makeFakeRedis();
    const fetchFn = vi.fn(async () => new Response("rate limited", { status: 429 }));
    const client = createJitoBundleClient({
      redis,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(await client.getBundleForTx("sig")).toBeNull();
  });
});
