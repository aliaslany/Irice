import { describe, expect, it } from "vitest";
import { BADGE_CATALOG, badgeDefinition, evaluateBadges, type BadgeEvalInput } from "./badges";

function input(overrides: Partial<BadgeEvalInput> = {}): BadgeEvalInput {
  return {
    totalPaidOrders: 0,
    totalKg: 0,
    distinctVarietySlugs: new Set(),
    publishedVarietyCount: 4,
    distinctOriginProvinces: new Set(),
    hasBigBag: false,
    currentStreakMonths: 0,
    ...overrides,
  };
}

describe("BADGE_CATALOG", () => {
  it("has a unique code and Persian copy for every badge", () => {
    const codes = BADGE_CATALOG.map((b) => b.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const badge of BADGE_CATALOG) {
      expect(badge.labelFa.length).toBeGreaterThan(0);
      expect(badge.descriptionFa.length).toBeGreaterThan(0);
      expect(badge.icon.length).toBeGreaterThan(0);
    }
  });

  it("looks up a definition by code", () => {
    expect(badgeDefinition("first_harvest")?.labelFa).toBe("اولین برداشت");
    expect(badgeDefinition("no-such-badge")).toBeUndefined();
  });
});

describe("evaluateBadges()", () => {
  it("earns nothing from a blank history", () => {
    expect(evaluateBadges(input())).toEqual(new Set());
  });

  it("grants first_harvest on the very first paid order", () => {
    expect(evaluateBadges(input({ totalPaidOrders: 1 }))).toContain("first_harvest");
  });

  it("grants big_bag only when a 20kg pack was actually bought", () => {
    expect(evaluateBadges(input({ hasBigBag: true }))).toContain("big_bag");
    expect(evaluateBadges(input({ hasBigBag: false }))).not.toContain("big_bag");
  });

  it("grants variety_explorer at 3 distinct varieties, not before", () => {
    const two = evaluateBadges(input({ distinctVarietySlugs: new Set(["a", "b"]) }));
    const three = evaluateBadges(input({ distinctVarietySlugs: new Set(["a", "b", "c"]) }));
    expect(two).not.toContain("variety_explorer");
    expect(three).toContain("variety_explorer");
  });

  it("grants variety_explorer_all only at the full published count", () => {
    const result = evaluateBadges(
      input({ distinctVarietySlugs: new Set(["a", "b", "c", "d"]), publishedVarietyCount: 4 }),
    );
    expect(result).toContain("variety_explorer_all");
  });

  it("grants an origin badge only for a known rice-growing province", () => {
    const result = evaluateBadges(input({ distinctOriginProvinces: new Set(["گیلان", "یزد"]) }));
    expect(result).toContain("origin_gilan");
    expect(result).not.toContain("origin_yazd");
  });

  it("grants streak badges only up to the current streak length", () => {
    const result = evaluateBadges(input({ currentStreakMonths: 6 }));
    expect(result).toContain("harvest_streak_3");
    expect(result).toContain("harvest_streak_6");
    expect(result).not.toContain("harvest_streak_12");
  });

  it("grants loyalty count badges at their thresholds", () => {
    const result = evaluateBadges(input({ totalPaidOrders: 10 }));
    expect(result).toContain("loyal_5");
    expect(result).toContain("loyal_10");
    expect(result).not.toContain("loyal_25");
  });

  it("grants tier badges cumulatively — gold implies bronze and silver too", () => {
    const result = evaluateBadges(input({ totalKg: 150 }));
    expect(result).toContain("tier_bronze");
    expect(result).toContain("tier_silver");
    expect(result).toContain("tier_gold");
    expect(result).not.toContain("tier_diamond");
  });

  it("is monotonic: a strictly larger history never loses a badge", () => {
    const before = evaluateBadges(
      input({ totalPaidOrders: 5, totalKg: 50, currentStreakMonths: 3 }),
    );
    const after = evaluateBadges(
      input({ totalPaidOrders: 6, totalKg: 60, currentStreakMonths: 4 }),
    );
    for (const code of before) {
      expect(after).toContain(code);
    }
  });
});
