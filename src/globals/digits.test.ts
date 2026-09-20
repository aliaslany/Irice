import { describe, expect, it } from "vitest";
import {
  formatNumberFa,
  formatPercentFa,
  normalizeInput,
  normalizeLetters,
  normalizeMobile,
  toLatinDigits,
  toPersianDigits,
} from "./digits";

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

describe("formatNumberFa()", () => {
  it("uses the Persian decimal separator, not a Latin dot", () => {
    // toPersianDigits would give "۸.۶۰" — right digits, wrong punctuation.
    expect(formatNumberFa("8.60")).toBe("۸٫۶");
    expect(formatNumberFa("8.60")).not.toContain(".");
  });

  it("groups thousands the Persian way", () => {
    expect(formatNumberFa(1234567)).toBe("۱٬۲۳۴٬۵۶۷");
  });

  it("accepts the strings Postgres returns for numeric columns", () => {
    expect(formatNumberFa("2.10")).toBe("۲٫۱");
  });

  it("returns empty for a non-numeric value rather than NaN", () => {
    expect(formatNumberFa("not a number")).toBe("");
  });
});

describe("formatPercentFa()", () => {
  it("appends the Persian percent sign", () => {
    expect(formatPercentFa("8.60")).toBe("۸٫۶٪");
  });

  it("rounds to one fraction digit by default", () => {
    expect(formatPercentFa(5.74)).toBe("۵٫۷٪");
  });
});
