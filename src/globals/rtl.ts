/**
 * Direction.
 *
 * fa is RTL, en is LTR. Layout uses CSS logical properties (`margin-inline-start`,
 * not `margin-left`) so a single stylesheet serves both; this module supplies the
 * few values that must be decided in JS — the `dir` attribute, and the direction
 * marks that keep mixed Persian/Latin strings from reordering on screen.
 */
import type { Locale } from "./i18n.js";

export type Direction = "rtl" | "ltr";

const DIRECTION: Record<Locale, Direction> = { fa: "rtl", en: "ltr" };

export function directionOf(locale: Locale): Direction {
  return DIRECTION[locale];
}

export function isRtl(locale: Locale): boolean {
  return directionOf(locale) === "rtl";
}

/** Attributes to spread onto `<html>`. */
export function htmlAttributes(locale: Locale): { lang: Locale; dir: Direction } {
  return { lang: locale, dir: directionOf(locale) };
}

const LRM = "‎";
const RLM = "‏";

/**
 * Isolate a Latin run (a lot code like `HSH-1405-07`, a tracking number, an
 * email) inside RTL text, so the bidi algorithm doesn't reverse its punctuation.
 */
export function isolateLtr(value: string): string {
  return `${LRM}${value}${LRM}`;
}

export function isolateRtl(value: string): string {
  return `${RLM}${value}${RLM}`;
}
