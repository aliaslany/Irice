import { describe, expect, it } from "vitest";
import { currentJalaliYear, formatJalali, fromJalali, harvestAge, toJalali } from "./date";

describe("Jalali conversion", () => {
  it("converts a known Gregorian date to Jalali", () => {
    // 2026-09-20T12:00Z → 29 Shahrivar 1405 in Tehran.
    expect(toJalali(new Date("2026-09-20T12:00:00Z"))).toEqual({ jy: 1405, jm: 6, jd: 29 });
  });

  it("uses the Tehran offset, not UTC, near midnight", () => {
    // 20:40 UTC is 00:10 the next day in Tehran (UTC+3:30).
    const late = toJalali(new Date("2026-09-20T20:40:00Z"));
    const earlier = toJalali(new Date("2026-09-20T12:00:00Z"));
    expect(late.jd).toBe(earlier.jd + 1);
  });

  it("round-trips through fromJalali", () => {
    const original = { jy: 1405, jm: 6, jd: 29 };
    expect(toJalali(fromJalali(original))).toEqual(original);
  });

  it("rejects an invalid Jalali date", () => {
    expect(() => fromJalali({ jy: 1405, jm: 13, jd: 1 })).toThrow();
  });
});

describe("formatJalali()", () => {
  it("renders a long Persian date", () => {
    expect(formatJalali(new Date("2026-09-20T12:00:00Z"))).toBe("۲۹ شهریور ۱۴۰۵");
  });

  it("renders a numeric date in Latin digits on request", () => {
    expect(
      formatJalali(new Date("2026-09-20T12:00:00Z"), { style: "numeric", persianDigits: false }),
    ).toBe("1405/06/29");
  });
});

describe("harvest year", () => {
  const now = new Date("2026-09-20T12:00:00Z");

  it("reports the current Jalali year", () => {
    expect(currentJalaliYear(now)).toBe(1405);
  });

  it("ages a lot by harvests", () => {
    expect(harvestAge(1405, now)).toBe(0); // this year's crop
    expect(harvestAge(1404, now)).toBe(1); // کهنه
  });
});
