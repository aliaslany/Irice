/**
 * Dates.
 *
 * Rule: **the database stores UTC `timestamptz`, always.** Jalali exists only
 * at the rendering edge and in domain values that are genuinely Jalali — the
 * harvest year of a lot (سال برداشت) is a Jalali year, because that is how the
 * crop is identified by every grower, mill and customer in the market.
 *
 * Storing a formatted Jalali string in the DB is the trap here; it is not
 * sortable, not comparable across timezones, and not convertible back safely.
 */
import jalaali from "jalaali-js";

export interface JalaliDate {
  /** Jalali year, e.g. 1405. */
  jy: number;
  /** Jalali month, 1-12. */
  jm: number;
  /** Jalali day of month, 1-31. */
  jd: number;
}

export const JALALI_MONTHS_FA = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
] as const;

/** Tehran is UTC+03:30 year-round (DST was abolished in 1401/2022). */
export const TEHRAN_UTC_OFFSET_MINUTES = 210;

export class DateError extends Error {
  override readonly name = "DateError";
}

/** Convert an instant to the Jalali calendar date as seen in Tehran. */
export function toJalali(instant: Date): JalaliDate {
  if (Number.isNaN(instant.getTime())) {
    throw new DateError("toJalali() received an invalid Date");
  }
  const tehran = new Date(instant.getTime() + TEHRAN_UTC_OFFSET_MINUTES * 60_000);
  const { jy, jm, jd } = jalaali.toJalaali(
    tehran.getUTCFullYear(),
    tehran.getUTCMonth() + 1,
    tehran.getUTCDate(),
  );
  return { jy, jm, jd };
}

/** Convert a Jalali calendar date (Tehran midnight) to a UTC instant. */
export function fromJalali(date: JalaliDate): Date {
  if (!jalaali.isValidJalaaliDate(date.jy, date.jm, date.jd)) {
    throw new DateError(`Invalid Jalali date: ${date.jy}/${date.jm}/${date.jd}`);
  }
  const { gy, gm, gd } = jalaali.toGregorian(date.jy, date.jm, date.jd);
  return new Date(Date.UTC(gy, gm - 1, gd) - TEHRAN_UTC_OFFSET_MINUTES * 60_000);
}

export interface FormatJalaliOptions {
  /** "numeric" → ۱۴۰۵/۰۶/۳۰, "long" → ۳۰ شهریور ۱۴۰۵ */
  style?: "numeric" | "long";
  persianDigits?: boolean;
}

export function formatJalali(instant: Date, options: FormatJalaliOptions = {}): string {
  const { style = "long", persianDigits = true } = options;
  const { jy, jm, jd } = toJalali(instant);
  const latin =
    style === "numeric"
      ? `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`
      : `${jd} ${JALALI_MONTHS_FA[jm - 1]} ${jy}`;
  if (!persianDigits) return latin;
  // Local import avoids a cycle: digits.ts has no date dependency.
  return latin.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]!);
}

/** The current Jalali year in Tehran — the default harvest year for new lots. */
export function currentJalaliYear(now: Date = new Date()): number {
  return toJalali(now).jy;
}

/**
 * How many harvests old a lot is. Rice is graded partly on age: `0` is this
 * year's crop (برنج تازه), `1` is last year's (کهنه), and the storefront shows
 * this rather than a raw year, because it is what buyers actually reason about.
 */
export function harvestAge(harvestYear: number, now: Date = new Date()): number {
  return currentJalaliYear(now) - harvestYear;
}
