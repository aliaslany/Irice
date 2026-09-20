/**
 * Money.
 *
 * The single rule this module exists to enforce: **all money in Irice is an
 * integer number of rials**. Never a float, never a Toman value in storage,
 * never a string parsed at the point of use.
 *
 * Iranian prices are quoted in Toman (1 Toman = 10 Rial) but the smallest
 * accounting unit is the rial, so the rial is what we store and compute with.
 * A 10kg bag of premium Hashemi is on the order of 6,000,000 Toman =
 * 60,000,000 rial, which is far inside `Number.MAX_SAFE_INTEGER`; we assert
 * that boundary rather than assume it.
 */

declare const rialBrand: unique symbol;

/** An integer count of Iranian rials. Construct with {@link rial}. */
export type Rial = number & { readonly [rialBrand]: true };

export const RIAL_PER_TOMAN = 10;

export class MoneyError extends Error {
  override readonly name = "MoneyError";
}

/** Construct a {@link Rial} from an integer, rejecting anything lossy. */
export function rial(value: number): Rial {
  if (!Number.isFinite(value)) {
    throw new MoneyError(`rial() requires a finite number, got ${value}`);
  }
  if (!Number.isInteger(value)) {
    throw new MoneyError(
      `rial() requires an integer; ${value} would lose precision. Round explicitly at the call site.`,
    );
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`rial() value ${value} exceeds safe integer range`);
  }
  return value as Rial;
}

export const ZERO_RIAL = rial(0);

export function fromToman(toman: number): Rial {
  return rial(Math.round(toman * RIAL_PER_TOMAN));
}

/** Exact only when the amount is a whole number of Toman; use for display. */
export function toToman(amount: Rial): number {
  return amount / RIAL_PER_TOMAN;
}

export function addRial(...amounts: Rial[]): Rial {
  return rial(amounts.reduce<number>((sum, a) => sum + a, 0));
}

export function subRial(a: Rial, b: Rial): Rial {
  return rial(a - b);
}

/**
 * Multiply money by a float factor. Rounding is explicit because the result
 * must land on a whole rial.
 *
 * When the factor is a ratio of two integers, use {@link mulRatioRial} instead:
 * a float factor cannot represent every ratio exactly, so a value sitting on a
 * .5 rounding boundary can fall either way.
 */
export function mulRial(
  amount: Rial,
  factor: number,
  rounding: "round" | "floor" | "ceil" = "round",
): Rial {
  if (!Number.isFinite(factor)) {
    throw new MoneyError(`mulRial() requires a finite factor, got ${factor}`);
  }
  const raw = amount * factor;
  const rounded =
    rounding === "floor" ? Math.floor(raw) : rounding === "ceil" ? Math.ceil(raw) : Math.round(raw);
  return rial(rounded);
}

/**
 * Multiply money by an exact ratio (numerator/denominator).
 *
 * Prefer this over {@link mulRial} whenever the factor is really a fraction of
 * two integers — above all `price_per_kg × grams / 1000`, the most-used money
 * operation in the catalog. Multiplying first and dividing second keeps the
 * whole computation in integer space, so results do not depend on whether the
 * ratio happens to be representable as a float. (`100 * 1.005` is
 * `100.49999999999999`, which rounds to 100; `mulRatioRial(100, 1005, 1000)`
 * is exactly 100.5, which rounds to 101.)
 */
export function mulRatioRial(
  amount: Rial,
  numerator: number,
  denominator: number,
  rounding: "round" | "floor" | "ceil" = "round",
): Rial {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator)) {
    throw new MoneyError("mulRatioRial() requires integer numerator and denominator");
  }
  if (denominator === 0) {
    throw new MoneyError("mulRatioRial() denominator must not be zero");
  }
  const product = amount * numerator;
  if (!Number.isSafeInteger(product)) {
    throw new MoneyError(
      `mulRatioRial() intermediate product ${product} exceeds safe integer range`,
    );
  }
  const quotient = product / denominator;
  const rounded =
    rounding === "floor"
      ? Math.floor(quotient)
      : rounding === "ceil"
        ? Math.ceil(quotient)
        : Math.round(quotient);
  return rial(rounded);
}

/**
 * Split an amount into `parts` whole rials that sum back to the original.
 * Used by installment schedules, where the remainder must land somewhere
 * deterministic rather than vanishing: the earliest instalments absorb it.
 */
export function splitRial(amount: Rial, parts: number): Rial[] {
  if (!Number.isInteger(parts) || parts < 1) {
    throw new MoneyError(`splitRial() requires a positive integer part count, got ${parts}`);
  }
  const base = Math.floor(amount / parts);
  const remainder = amount - base * parts;
  return Array.from({ length: parts }, (_, i) => rial(base + (i < remainder ? 1 : 0)));
}

export interface FormatMoneyOptions {
  /** Display unit. Iranian storefronts quote Toman; receipts sometimes need rial. */
  unit?: "toman" | "rial";
  /** Render digits as Persian (۰-۹). Defaults to true for the fa-IR storefront. */
  persianDigits?: boolean;
  /** Append the unit label ("تومان"/"ریال"). */
  withLabel?: boolean;
}

const UNIT_LABEL_FA = { toman: "تومان", rial: "ریال" } as const;

/** Format money for display. Grouping uses the fa-IR locale separator. */
export function formatMoney(amount: Rial, options: FormatMoneyOptions = {}): string {
  const { unit = "toman", persianDigits = true, withLabel = true } = options;
  const value = unit === "toman" ? toToman(amount) : (amount as number);
  const formatted = new Intl.NumberFormat(persianDigits ? "fa-IR" : "en-US", {
    maximumFractionDigits: 1,
    useGrouping: true,
  }).format(value);
  return withLabel ? `${formatted} ${UNIT_LABEL_FA[unit]}` : formatted;
}
