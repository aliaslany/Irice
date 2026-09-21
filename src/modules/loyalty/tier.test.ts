import { describe, expect, it } from "vitest";
import { computeTier, kgToNextTier, tierLabelFa } from "./tier";

describe("computeTier()", () => {
  it.each([
    [0, "none"],
    [9.9, "none"],
    [10, "bronze"],
    [49, "bronze"],
    [50, "silver"],
    [149, "silver"],
    [150, "gold"],
    [399, "gold"],
    [400, "diamond"],
    [1000, "diamond"],
  ] as const)("classifies %skg as %s", (kg, tier) => {
    expect(computeTier(kg)).toBe(tier);
  });
});

describe("kgToNextTier()", () => {
  it("reports the remaining kg to the next tier", () => {
    expect(kgToNextTier(3)).toEqual({ nextTier: "bronze", remainingKg: 7 });
    expect(kgToNextTier(10)).toEqual({ nextTier: "silver", remainingKg: 40 });
  });

  it("returns null at the top tier", () => {
    expect(kgToNextTier(400)).toBeNull();
    expect(kgToNextTier(10_000)).toBeNull();
  });
});

describe("tierLabelFa()", () => {
  it("has a Persian label for every tier", () => {
    expect(tierLabelFa("none")).toBeTruthy();
    expect(tierLabelFa("bronze")).toBeTruthy();
    expect(tierLabelFa("diamond")).toBeTruthy();
  });
});
