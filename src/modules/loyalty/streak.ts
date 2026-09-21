/**
 * Purchase streaks, in Jalali calendar months.
 *
 * Pure — given the distinct Jalali (year, month) pairs a customer had a PAID
 * order in, and "now", compute the current and longest streak. Deliberately
 * has no persisted counter to decrement on a timer: a streak is a fact about
 * order history, recomputed on read, the same reason harvestAge in
 * globals/date.ts is a function and not a stored column. Nothing needs to run
 * at midnight for a streak to be accurate.
 *
 * A one-month grace period keeps "current" meaningful: a streak built through
 * Shahrivar isn't considered broken the instant Mehr 1 arrives before that
 * month's order has been placed — only once a full calendar month has passed
 * with no order at all.
 */
import type { JalaliDate } from "../../globals/date";

/** An absolute, comparable month index: (year * 12 + month). */
function monthIndex(jy: number, jm: number): number {
  return jy * 12 + jm;
}

export interface StreakResult {
  currentMonths: number;
  longestMonths: number;
}

export function computeStreak(paidOrderDates: readonly JalaliDate[], now: JalaliDate): StreakResult {
  if (paidOrderDates.length === 0) return { currentMonths: 0, longestMonths: 0 };

  const distinctMonths = Array.from(
    new Set(paidOrderDates.map((d) => monthIndex(d.jy, d.jm))),
  ).sort((a, b) => a - b);

  let longestMonths = 1;
  let runLength = 1;
  for (let i = 1; i < distinctMonths.length; i++) {
    const prev = distinctMonths[i - 1]!;
    const curr = distinctMonths[i]!;
    runLength = curr === prev + 1 ? runLength + 1 : 1;
    longestMonths = Math.max(longestMonths, runLength);
  }

  // The run ending at the most recent purchase month.
  let currentMonths = 1;
  for (let i = distinctMonths.length - 1; i > 0; i--) {
    if (distinctMonths[i]! === distinctMonths[i - 1]! + 1) currentMonths++;
    else break;
  }

  const nowIndex = monthIndex(now.jy, now.jm);
  const lastPurchaseIndex = distinctMonths[distinctMonths.length - 1]!;
  // Broken once more than one full month has passed with no order.
  const isCurrent = nowIndex - lastPurchaseIndex <= 1;

  return { currentMonths: isCurrent ? currentMonths : 0, longestMonths };
}

/** Streak-length milestones the badge catalog checks against. */
export const STREAK_BADGE_THRESHOLDS_MONTHS = [3, 6, 12] as const;
