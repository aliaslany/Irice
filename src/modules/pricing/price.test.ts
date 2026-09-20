import { describe, expect, it } from "vitest";
import { fromToman, rial, toToman } from "../../globals/money.js";
import { kg, PACK_SIZES_G } from "../../globals/weight.js";
import { derivePrice, priceChangePct, priceLotPacks, roundToDisplayStep } from "./price.js";

describe("derivePrice()", () => {
  it("prices a 10kg pack from a per-kg lot price", () => {
    const perKg = fromToman(593_000); // ≈ the Khordad 1405 Hashemi rate
    const { totalRial } = derivePrice({ pricePerKgRial: perKg, packSizeG: kg(10) });
    expect(toToman(totalRial)).toBe(5_930_000);
  });

  it("adds the packaging fee on top", () => {
    const breakdown = derivePrice({
      pricePerKgRial: fromToman(500_000),
      packSizeG: kg(5),
      packagingFeeRial: fromToman(20_000),
    });
    expect(toToman(breakdown.riceRial)).toBe(2_500_000);
    expect(toToman(breakdown.packagingRial)).toBe(20_000);
    expect(toToman(breakdown.totalRial)).toBe(2_520_000);
  });

  it("reports an effective per-kg price that includes packaging", () => {
    const breakdown = derivePrice({
      pricePerKgRial: fromToman(500_000),
      packSizeG: kg(5),
      packagingFeeRial: fromToman(20_000),
    });
    // 2,520,000 Toman for 5kg = 504,000 Toman/kg, not the headline 500,000.
    expect(toToman(breakdown.effectivePerKgRial)).toBe(504_000);
  });

  it("never under-charges on a fractional pack", () => {
    const breakdown = derivePrice({ pricePerKgRial: rial(1001), packSizeG: kg(0.75) });
    expect(breakdown.riceRial).toBe(751); // 750.75 rounded up
  });

  it("keeps a 20kg pack equal to four 5kg packs of the same lot", () => {
    const perKg = fromToman(593_000);
    const bulk = derivePrice({ pricePerKgRial: perKg, packSizeG: kg(20) });
    const single = derivePrice({ pricePerKgRial: perKg, packSizeG: kg(5) });
    expect(bulk.riceRial).toBe(single.riceRial * 4);
  });
});

describe("roundToDisplayStep()", () => {
  it("rounds up to a whole thousand Toman", () => {
    expect(toToman(roundToDisplayStep(fromToman(593_417)))).toBe(594_000);
  });

  it("leaves an already-clean price alone", () => {
    expect(toToman(roundToDisplayStep(fromToman(594_000)))).toBe(594_000);
  });

  it("rejects a non-positive step", () => {
    expect(() => roundToDisplayStep(fromToman(1000), rial(0))).toThrow(RangeError);
  });
});

describe("priceLotPacks()", () => {
  it("prices every supported pack size from one lot price", () => {
    const prices = priceLotPacks(fromToman(593_000), PACK_SIZES_G);
    expect([...prices.keys()]).toEqual([1000, 5000, 10_000, 20_000]);
    expect(toToman(prices.get(kg(1))!.totalRial)).toBe(593_000);
    expect(toToman(prices.get(kg(20))!.totalRial)).toBe(11_860_000);
  });

  it("applies a per-size packaging fee", () => {
    const prices = priceLotPacks(fromToman(500_000), [kg(1), kg(20)], (size) =>
      size === kg(1) ? fromToman(15_000) : fromToman(40_000),
    );
    expect(toToman(prices.get(kg(1))!.totalRial)).toBe(515_000);
    expect(toToman(prices.get(kg(20))!.totalRial)).toBe(10_040_000);
  });
});

describe("priceChangePct()", () => {
  it("reports a rise as positive", () => {
    expect(priceChangePct(fromToman(500_000), fromToman(600_000))).toBeCloseTo(20);
  });

  it("reports a fall as negative", () => {
    expect(priceChangePct(fromToman(600_000), fromToman(540_000))).toBeCloseTo(-10);
  });

  it("refuses to divide by a zero baseline", () => {
    expect(() => priceChangePct(rial(0), fromToman(1000))).toThrow(RangeError);
  });
});
