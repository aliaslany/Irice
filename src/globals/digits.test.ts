import { describe, expect, it } from "vitest";
import {
  normalizeInput,
  normalizeLetters,
  normalizeMobile,
  toLatinDigits,
  toPersianDigits,
} from "./digits.js";

describe("digit conversion", () => {
  it("converts Persian digits to Latin", () => {
    expect(toLatinDigits("۰۹۱۲۳۴۵۶۷۸۹")).toBe("09123456789");
  });

  it("converts Arabic-Indic digits to Latin", () => {
    expect(toLatinDigits("١٢٣٤٥")).toBe("12345");
  });

  it("leaves non-digits untouched", () => {
    expect(toLatinDigits("کد ۱۴۰۵")).toBe("کد 1405");
  });

  it("converts back for display", () => {
    expect(toPersianDigits("1405/06/30")).toBe("۱۴۰۵/۰۶/۳۰");
  });
});

describe("normalizeLetters()", () => {
  it("maps Arabic ي and ك to Persian ی and ک", () => {
    expect(normalizeLetters("كيلو")).toBe("کیلو");
  });
});

describe("normalizeInput()", () => {
  it("strips zero-width characters and collapses whitespace", () => {
    expect(normalizeInput("  برنج‌هاشمی   ۱۰  ")).toBe("برنجهاشمی 10");
  });
});

describe("normalizeMobile()", () => {
  it.each([
    ["09123456789", "09123456789"],
    ["۰۹۱۲۳۴۵۶۷۸۹", "09123456789"],
    ["+98 912 345 6789", "09123456789"],
    ["00989123456789", "09123456789"],
    ["989123456789", "09123456789"],
    ["9123456789", "09123456789"],
    ["0912-345-6789", "09123456789"],
  ])("normalises %s", (input, expected) => {
    expect(normalizeMobile(input)).toBe(expected);
  });

  it.each(["0812345678", "0912345678", "not a phone", ""])("rejects %s", (input) => {
    expect(normalizeMobile(input)).toBeNull();
  });
});
