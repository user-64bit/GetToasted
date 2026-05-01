import { describe, it, expect } from "vitest";
import { firstSlotOfEpoch, slotToEpoch } from "./leader-schedule.js";

describe("leader-schedule helpers", () => {
  it("slotToEpoch divides by epoch length", () => {
    expect(slotToEpoch(0n)).toBe(0);
    expect(slotToEpoch(431_999n)).toBe(0);
    expect(slotToEpoch(432_000n)).toBe(1);
    expect(slotToEpoch(864_000n)).toBe(2);
  });

  it("firstSlotOfEpoch is the inverse on epoch boundaries", () => {
    expect(firstSlotOfEpoch(0)).toBe(0n);
    expect(firstSlotOfEpoch(1)).toBe(432_000n);
    expect(firstSlotOfEpoch(700)).toBe(BigInt(700) * 432_000n);
  });
});
