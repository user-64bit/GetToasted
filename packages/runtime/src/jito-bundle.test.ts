import { describe, expect, it } from "vitest";
import {
  createInMemoryJitoBundleClient,
  createNullJitoBundleClient,
} from "./jito-bundle.js";

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

describe("createNullJitoBundleClient", () => {
  it("returns null for every signature lookup", async () => {
    const client = createNullJitoBundleClient();
    expect(await client.getBundleForTx("anysig")).toBeNull();
    expect(await client.getBundleForTx("anothersig")).toBeNull();
  });
});
