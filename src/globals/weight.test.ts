import { describe, expect, it } from "vitest";
import {
  addGrams,
  formatWeight,
  grams,
  isSupportedPackSize,
  kg,
  PACK_SIZES_G,
  scaleGrams,
  subGrams,
  toKg,
  WeightError,
} from "./weight.js";

describe("grams()", () => {
  it("rejects fractional grams", () => {
    expect(() => grams(10.5)).toThrow(WeightError);
  });
});

describe("kg()", () => {
  it("converts whole and fractional kilos", () => {
    expect(kg(10)).toBe(10_000);
    expect(kg(0.75)).toBe(750);
  });

  it("round-trips", () => {
    expect(toKg(kg(20))).toBe(20);
  });
});

describe("arithmetic", () => {
  it("makes one 20kg sale equal four 5kg sales", () => {
    const bulk = kg(20);
    const packs = addGrams(kg(5), kg(5), kg(5), kg(5));
    expect(packs).toBe(bulk);
  });

  it("subtracts and scales", () => {
    expect(subGrams(kg(10), kg(3))).toBe(7000);
    expect(scaleGrams(kg(1), 2.5)).toBe(2500);
  });
});

describe("pack sizes", () => {
  it("recognises the supported sizes", () => {
    expect(PACK_SIZES_G).toEqual([1000, 5000, 10_000, 20_000]);
    expect(isSupportedPackSize(kg(10))).toBe(true);
    expect(isSupportedPackSize(kg(3))).toBe(false);
  });
});

describe("formatWeight()", () => {
  it("shows kilos above 1kg and grams below", () => {
    expect(formatWeight(kg(10), { persianDigits: false })).toBe("10 کیلوگرم");
    expect(formatWeight(grams(500), { persianDigits: false })).toBe("500 گرم");
  });
});
