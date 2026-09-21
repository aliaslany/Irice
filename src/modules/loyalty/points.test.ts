import { describe, expect, it } from "vitest";
import { fromToman, rial, toToman } from "../../globals/money";
import { applyRedemption, maxRedeemablePoints, pointsForOrder, redemptionValueRial } from "./points";

describe("pointsForOrder()", () => {
  it("earns one point per 20,000 rial, floored", () => {
    expect(pointsForOrder(fromToman(1_000_000))).toBe(500); // 10,000,000 rial / 20,000
  });

  it("floors a partial point rather than rounding up", () => {
    // 250,005 rial / 20,000 = 12.50025 -> floors to 12, not 13.
    expect(pointsForOrder(rial(250_005))).toBe(12);
  });

  it("earns zero on a subtotal under one point's worth", () => {
    expect(pointsForOrder(fromToman(1))).toBe(0);
  });
});

describe("redemptionValueRial()", () => {
  it("values a point at 500 rial", () => {
    expect(redemptionValueRial(100)).toBe(50_000);
  });

  it("values zero points at nothing", () => {
    expect(redemptionValueRial(0)).toBe(0);
  });
});

describe("maxRedeemablePoints()", () => {
  it("caps redemption at 30% of the subtotal", () => {
    // 30% of 10,000,000 rial = 3,000,000 rial = 6,000 points at 500 rial/point.
    expect(maxRedeemablePoints(fromToman(1_000_000), 999_999)).toBe(6_000);
  });

  it("caps redemption at the customer's balance when it's the binding constraint", () => {
    expect(maxRedeemablePoints(fromToman(1_000_000), 10)).toBe(10);
  });

  it("never returns a negative cap", () => {
    expect(maxRedeemablePoints(fromToman(0), 100)).toBe(0);
  });
});

describe("applyRedemption()", () => {
  it("applies a valid redemption in full", () => {
    const result = applyRedemption(fromToman(1_000_000), 100, 100);
    expect(result.pointsRedeemed).toBe(100);
    expect(toToman(result.discountRial)).toBe(5_000);
    expect(toToman(result.totalAfterDiscountRial)).toBe(995_000);
  });

  it("clamps a request above the balance", () => {
    const result = applyRedemption(fromToman(1_000_000), 50, 100);
    expect(result.pointsRedeemed).toBe(50);
  });

  it("clamps a request above the 30% cap even with enough balance", () => {
    const result = applyRedemption(fromToman(1_000_000), 999_999, 999_999);
    expect(result.pointsRedeemed).toBe(6_000);
  });

  it("never lets a discount exceed the subtotal", () => {
    const result = applyRedemption(fromToman(1_000_000), 999_999, 999_999);
    expect(result.discountRial).toBeLessThanOrEqual(fromToman(1_000_000));
    expect(result.totalAfterDiscountRial).toBeGreaterThanOrEqual(0);
  });

  it("ignores a negative or fractional request rather than erroring", () => {
    expect(applyRedemption(fromToman(1_000_000), 100, -5).pointsRedeemed).toBe(0);
    expect(applyRedemption(fromToman(1_000_000), 100, 10.9).pointsRedeemed).toBe(10);
  });
});
