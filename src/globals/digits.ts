/**
 * Persian/Arabic digit handling.
 *
 * Two directions, both needed:
 *  - **In**: a customer types ۰۹۱۲۳۴۵۶۷۸۹ into a phone field, or pastes an
 *    Arabic-Indic ٠١٢٣ postal code. Normalise before validation or the regex
 *    fails on a perfectly valid input. This is the single most common bug in
 *    Iranian web forms.
 *  - **Out**: render Latin digits as Persian for the fa-IR storefront.
 *
 * Also normalises the Arabic ي/ك to Persian ی/ک, which arrive from iOS
 * keyboards and silently break equality checks on names and addresses.
 */

const PERSIAN_ZERO = 0x06f0; // ۰
const ARABIC_ZERO = 0x0660; // ٠
const LATIN_DIGITS = "0123456789";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** Convert Persian (۰-۹) and Arabic-Indic (٠-٩) digits to Latin (0-9). */
export function toLatinDigits(input: string): string {
  let out = "";
  for (const char of input) {
    const code = char.codePointAt(0)!;
    if (code >= PERSIAN_ZERO && code <= PERSIAN_ZERO + 9) {
      out += String(code - PERSIAN_ZERO);
    } else if (code >= ARABIC_ZERO && code <= ARABIC_ZERO + 9) {
      out += String(code - ARABIC_ZERO);
    } else {
      out += char;
    }
  }
  return out;
}

/** Convert Latin digits to Persian, for display only. */
export function toPersianDigits(input: string): string {
  let out = "";
  for (const char of input) {
    const index = LATIN_DIGITS.indexOf(char);
    out += index === -1 ? char : PERSIAN_DIGITS[index];
  }
  return out;
}

/** Map Arabic letterforms to their Persian equivalents. */
export function normalizeLetters(input: string): string {
  return input.replace(/ي/g, "ی").replace(/ك/g, "ک");
}

/**
 * The normaliser to run on every text input before validation or storage:
 * Latin digits, Persian letterforms, no zero-width joiners, collapsed spaces.
 */
export function normalizeInput(input: string): string {
  return normalizeLetters(toLatinDigits(input))
    .replace(/[​-‍﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Iranian mobile numbers, stored canonically as `09xxxxxxxxx`. */
const MOBILE_PATTERN = /^09\d{9}$/;

/**
 * Normalise a mobile number typed in any of the forms Iranians actually use:
 * `+98 912 …`, `0098912…`, `۰۹۱۲…`, with spaces or dashes. Returns null when
 * the input is not a valid Iranian mobile number.
 */
export function normalizeMobile(input: string): string | null {
  let digits = toLatinDigits(input).replace(/[\s()\-.]/g, "");
  if (digits.startsWith("+98")) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith("0098")) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith("98") && digits.length === 12) digits = `0${digits.slice(2)}`;
  else if (digits.startsWith("9") && digits.length === 10) digits = `0${digits}`;
  return MOBILE_PATTERN.test(digits) ? digits : null;
}
