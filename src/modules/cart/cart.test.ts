import { describe, expect, it } from "vitest";
import { fromToman } from "../../globals/money";
import { kg } from "../../globals/weight";
import { clampQuantity, computeCartTotals, type ResolvedCartLine } from "./cart";

function line(overrides: Partial<ResolvedCartLine> = {}): ResolvedCartLine {
  return {
    varietyId: "v1",
    varietySlug: "tarom-hashemi",
    varietyNameFa: "طارم هاشمی",
    packSizeG: kg(10),
    quantity: 1,
    unitPriceRial: fromToman(600_000),
    lineTotalRial: fromToman(600_000),
    lineWeightG: kg(10),
    isAvailable: true,
    ...overrides,
  };
}

describe("computeCartTotals()", () => {
  it("sums an empty cart to zero, not an error", () => {
    expect(computeCartTotals([])).toEqual({
      subtotalRial: 0,
      totalWeightG: 0,
      itemCount: 0,
      hasUnavailableLine: false,
    });
  });

  it("adds price and weight across lines", () => {
    const totals = computeCartTotals([
      line({ quantity: 2, lineTotalRial: fromToman(1_200_000), lineWeightG: kg(20) }),
      line({ packSizeG: kg(5), lineTotalRial: fromToman(320_000), lineWeightG: kg(5) }),
    ]);
    expect(totals.subtotalRial).toBe(fromToman(1_520_000));
    expect(totals.totalWeightG).toBe(kg(25));
    expect(totals.itemCount).toBe(3);
  });

  it("flags the cart when any line has gone out of stock", () => {
    const totals = computeCartTotals([line({ isAvailable: true }), line({ isAvailable: false })]);
    expect(totals.hasUnavailableLine).toBe(true);
  });
});

describe("clampQuantity()", () => {
  it("keeps a normal value as-is", () => {
    expect(clampQuantity(3)).toBe(3);
  });

  it("floors below 1 up to 1", () => {
    expect(clampQuantity(0)).toBe(1);
    expect(clampQuantity(-5)).toBe(1);
  });

  it("caps an unreasonable manual entry", () => {
    expect(clampQuantity(500)).toBe(99);
  });

  it("rounds a fractional entry and never returns NaN", () => {
    expect(clampQuantity(2.6)).toBe(3);
    expect(clampQuantity(Number.NaN)).toBe(1);
  });
});
