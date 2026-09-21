import { describe, expect, it } from "vitest";
import { computeStreak } from "./streak";

const jd = (jy: number, jm: number) => ({ jy, jm, jd: 1 });

describe("computeStreak()", () => {
  it("is zero with no order history", () => {
    expect(computeStreak([], jd(1405, 6))).toEqual({ currentMonths: 0, longestMonths: 0 });
  });

  it("counts a single month as a streak of one", () => {
    expect(computeStreak([jd(1405, 6)], jd(1405, 6))).toEqual({
      currentMonths: 1,
      longestMonths: 1,
    });
  });

  it("counts consecutive months as a running streak", () => {
    const orders = [jd(1405, 4), jd(1405, 5), jd(1405, 6)];
    expect(computeStreak(orders, jd(1405, 6))).toEqual({ currentMonths: 3, longestMonths: 3 });
  });

  it("dedupes multiple orders within the same month", () => {
    const orders = [jd(1405, 6), jd(1405, 6), jd(1405, 5)];
    expect(computeStreak(orders, jd(1405, 6)).currentMonths).toBe(2);
  });

  it("carries a streak across a Jalali year boundary (Esfand -> Farvardin)", () => {
    const orders = [jd(1404, 11), jd(1404, 12), jd(1405, 1)];
    expect(computeStreak(orders, jd(1405, 1))).toEqual({ currentMonths: 3, longestMonths: 3 });
  });

  it("grants a one-month grace period before the streak is broken", () => {
    // Last order in month 5; "now" is month 6 — no order yet this month, but
    // the streak isn't broken until a full month has passed with none.
    expect(computeStreak([jd(1405, 4), jd(1405, 5)], jd(1405, 6)).currentMonths).toBe(2);
  });

  it("breaks the current streak after a full skipped month", () => {
    // Last order in month 4; "now" is month 6 -> month 5 had no order at all.
    expect(computeStreak([jd(1405, 3), jd(1405, 4)], jd(1405, 6)).currentMonths).toBe(0);
  });

  it("keeps the longest streak on record even after it breaks", () => {
    const orders = [jd(1404, 1), jd(1404, 2), jd(1404, 3), jd(1405, 6)];
    const result = computeStreak(orders, jd(1405, 6));
    expect(result.longestMonths).toBe(3);
    expect(result.currentMonths).toBe(1);
  });

  it("finds the longest streak even when it isn't the most recent one", () => {
    const orders = [jd(1404, 1), jd(1404, 2), jd(1404, 3), jd(1404, 4), jd(1404, 8), jd(1404, 9)];
    const result = computeStreak(orders, jd(1405, 6));
    expect(result.longestMonths).toBe(4);
    expect(result.currentMonths).toBe(0);
  });
});
