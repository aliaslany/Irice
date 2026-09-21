import { describe, expect, it } from "vitest";
import { fromToman, rial, toToman } from "../../globals/money";
import { kg } from "../../globals/weight";
import { freeShippingProgress, quoteShipping } from "./rate";
import { SHIPPING_ZONES, zoneForProvince } from "./zones";

describe("zoneForProvince()", () => {
  it("maps the two rice-growing provinces to the cheap north zone", () => {
    expect(zoneForProvince("گیلان").code).toBe("north");
    expect(zoneForProvince("مازندران").code).toBe("north");
  });

  it("maps Tehran to its own zone", () => {
    expect(zoneForProvince("تهران").code).toBe("tehran");
  });

  it("defaults an unlisted province to rest_of_country rather than the cheapest zone", () => {
    expect(zoneForProvince("خراسان رضوی").code).toBe("rest_of_country");
  });

  it("tolerates surrounding whitespace", () => {
    expect(zoneForProvince("  گیلان  ").code).toBe("north");
  });
});

describe("quoteShipping()", () => {
  it("charges base fee plus weight, rounded up", () => {
    const quote = quoteShipping({
      totalWeightG: kg(10),
      zone: SHIPPING_ZONES.north,
      subtotalRial: fromToman(500_000),
      freeShippingThresholdRial: rial(0),
    });
    // 150,000 base + 10 * 8,000 = 230,000 rial = 23,000 Toman.
    expect(toToman(quote.feeRial)).toBe(23_000);
    expect(quote.isFree).toBe(false);
  });

  it("rounds a fractional kilogram up rather than undercharging", () => {
    const quote = quoteShipping({
      totalWeightG: kg(1.2),
      zone: SHIPPING_ZONES.tehran,
      subtotalRial: fromToman(100_000),
      freeShippingThresholdRial: rial(0),
    });
    // base 250,000 + ceil(1.2 * 12,000) = 250,000 + 14,400 = 264,400 rial.
    expect(quote.feeRial).toBe(264_400);
  });

  it("is free once the subtotal meets the threshold", () => {
    const quote = quoteShipping({
      totalWeightG: kg(20),
      zone: SHIPPING_ZONES.rest_of_country,
      subtotalRial: fromToman(3_000_000),
      freeShippingThresholdRial: fromToman(2_000_000),
    });
    expect(quote.isFree).toBe(true);
    expect(quote.feeRial).toBe(0);
    expect(quote.remainingToFreeRial).toBeNull();
  });

  it("reports exactly how much more unlocks free shipping", () => {
    const quote = quoteShipping({
      totalWeightG: kg(5),
      zone: SHIPPING_ZONES.north,
      subtotalRial: fromToman(1_500_000),
      freeShippingThresholdRial: fromToman(2_000_000),
    });
    expect(quote.isFree).toBe(false);
    expect(toToman(quote.remainingToFreeRial!)).toBe(500_000);
  });

  it("disables the threshold entirely at 0", () => {
    const quote = quoteShipping({
      totalWeightG: kg(1),
      zone: SHIPPING_ZONES.north,
      subtotalRial: fromToman(50_000_000),
      freeShippingThresholdRial: rial(0),
    });
    expect(quote.isFree).toBe(false);
    expect(quote.remainingToFreeRial).toBeNull();
  });
});

describe("freeShippingProgress()", () => {
  it("reports zero progress and no threshold when disabled", () => {
    expect(freeShippingProgress(fromToman(1_000_000), rial(0))).toEqual({
      isFree: false,
      remainingRial: 0,
      pct: 0,
    });
  });

  it("reports partial progress toward the threshold", () => {
    const progress = freeShippingProgress(fromToman(500_000), fromToman(2_000_000));
    expect(progress.isFree).toBe(false);
    expect(progress.pct).toBe(25);
    expect(toToman(progress.remainingRial)).toBe(1_500_000);
  });

  it("reports 100% once the subtotal meets the threshold", () => {
    const progress = freeShippingProgress(fromToman(2_000_000), fromToman(2_000_000));
    expect(progress).toEqual({ isFree: true, remainingRial: 0, pct: 100 });
  });
});
