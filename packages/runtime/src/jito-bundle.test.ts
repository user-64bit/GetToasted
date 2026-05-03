import { describe, expect, it } from "vitest";
import type { Redis } from "ioredis";
import {
  createJitoBundleClient,
  createInMemoryJitoBundleClient,
} from "./jito-bundle.js";

const fakeRedis = {} as Redis;

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

describe("createJitoBundleClient (no-op stub until indexer integration)", () => {
  // Jito has no public reverse-lookup endpoint. The production client is
  // a no-op stub that always returns null — see jito-bundle.ts header
  // comment for the rationale. These tests pin that contract so a future
  // refactor doesn't accidentally re-introduce the broken HTTP path.
  it("returns null for every signature lookup", async () => {
    const client = createJitoBundleClient({ redis: fakeRedis });
    expect(await client.getBundleForTx("anysig")).toBeNull();
    expect(await client.getBundleForTx("anothersig")).toBeNull();
  });

  it("never throws even on empty / malformed signatures", async () => {
    const client = createJitoBundleClient({ redis: fakeRedis });
    await expect(client.getBundleForTx("")).resolves.toBeNull();
  });
});
