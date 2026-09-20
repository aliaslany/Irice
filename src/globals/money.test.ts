import { describe, expect, it } from "vitest";
import {
  addRial,
  formatMoney,
  fromToman,
  mulRatioRial,
  mulRial,
  rial,
  splitRial,
  subRial,
  toToman,
  MoneyError,
} from "./money.js";

describe("rial()", () => {
  it("accepts integers", () => {
    expect(rial(59_300_000)).toBe(59_300_000);
  });

  it("rejects fractional values rather than silently rounding", () => {
    expect(() => rial(100.5)).toThrow(MoneyError);
  });

  it("rejects NaN and Infinity", () => {
    expect(() => rial(Number.NaN)).toThrow(MoneyError);
    expect(() => rial(Number.POSITIVE_INFINITY)).toThrow(MoneyError);
  });

  it("rejects values past the safe integer range", () => {
    expect(() => rial(Number.MAX_SAFE_INTEGER + 2)).toThrow(MoneyError);
  });
});

describe("toman conversion", () => {
  it("round-trips a realistic 10kg Hashemi price", () => {
    // ~5,930,000 Toman, the reported Khordad 1405 price for premium Hashemi.
    const price = fromToman(5_930_000);
    expect(price).toBe(59_300_000);
    expect(toToman(price)).toBe(5_930_000);
  });
});

describe("arithmetic", () => {
  it("adds and subtracts without drift", () => {
    expect(addRial(rial(1), rial(2), rial(3))).toBe(6);
    expect(subRial(rial(10), rial(3))).toBe(7);
  });

  it("multiplies with explicit rounding", () => {
    const perKg = rial(5_930_000);
    expect(mulRial(perKg, 0.75, "ceil")).toBe(4_447_500);
    expect(mulRial(rial(333), 1 / 3, "floor")).toBe(111);
    expect(mulRial(rial(100), 2.4, "round")).toBe(240);
  });

  it("never produces a fractional rial", () => {
    expect(Number.isInteger(mulRial(rial(59_300_000), 1 / 3))).toBe(true);
  });
});

describe("mulRatioRial()", () => {
  it("is exact where a float factor is not", () => {
    // 100 * 1.005 is 100.49999999999999 in float and rounds down; the ratio
    // form is exactly 100.5 and rounds up. This is why derivePrice uses it.
    expect(mulRial(rial(100), 1.005, "round")).toBe(100);
    expect(mulRatioRial(rial(100), 1005, 1000, "round")).toBe(101);
  });

  it("prices a pack weight without touching a float", () => {
    expect(mulRatioRial(fromToman(593_000), 10_000, 1000, "ceil")).toBe(
      fromToman(5_930_000),
    );
  });

  it("honours the rounding mode", () => {
    expect(mulRatioRial(rial(1000), 1, 3, "floor")).toBe(333);
    expect(mulRatioRial(rial(1000), 1, 3, "ceil")).toBe(334);
  });

  it("rejects non-integer terms and a zero denominator", () => {
    expect(() => mulRatioRial(rial(100), 1.5, 2)).toThrow(MoneyError);
    expect(() => mulRatioRial(rial(100), 1, 0)).toThrow(MoneyError);
  });

  it("refuses an intermediate product that would lose precision", () => {
    expect(() => mulRatioRial(rial(Number.MAX_SAFE_INTEGER), 1000, 1)).toThrow(MoneyError);
  });
});

describe("splitRial()", () => {
  it("splits evenly when it divides", () => {
    expect(splitRial(rial(900), 3)).toEqual([300, 300, 300]);
  });

  it("puts the remainder on the earliest instalments and sums back exactly", () => {
    const parts = splitRial(rial(1000), 3);
    expect(parts).toEqual([334, 333, 333]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it("holds for a realistic installment plan", () => {
    const total = fromToman(5_930_000);
    const parts = splitRial(total, 6);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
  });

  it("rejects a non-positive part count", () => {
    expect(() => splitRial(rial(100), 0)).toThrow(MoneyError);
  });
});

describe("formatMoney()", () => {
  it("renders Toman with Persian digits and a label by default", () => {
    const formatted = formatMoney(fromToman(5_930_000));
    expect(formatted).toContain("تومان");
    expect(formatted).toMatch(/[۰-۹]/);
  });

  it("can render Latin digits without a label", () => {
    expect(formatMoney(fromToman(1500), { persianDigits: false, withLabel: false })).toBe("1,500");
  });
});
