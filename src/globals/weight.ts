/**
 * Weight.
 *
 * Rice inventory is tracked in **grams, as integers, everywhere**. Not in
 * "units", not in kilograms-as-float. A lot is depleted by sales of 1/5/10/20kg
 * packs, and a 20kg sale and four 5kg sales must be the same movement against
 * the same ledger.
 *
 * Shipping also prices on total weight, so grams are the join between the
 * catalog and the rate engine.
 */

declare const gramBrand: unique symbol;

/** An integer count of grams. Construct with {@link grams} or {@link kg}. */
export type Grams = number & { readonly [gramBrand]: true };

export const GRAMS_PER_KG = 1000;

export class WeightError extends Error {
  override readonly name = "WeightError";
}

export function grams(value: number): Grams {
  if (!Number.isFinite(value)) {
    throw new WeightError(`grams() requires a finite number, got ${value}`);
  }
  if (!Number.isInteger(value)) {
    throw new WeightError(`grams() requires an integer, got ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new WeightError(`grams() value ${value} exceeds safe integer range`);
  }
  return value as Grams;
}

export const ZERO_GRAMS = grams(0);

/** Construct from kilograms. Fractional kg are allowed and rounded to a gram. */
export function kg(value: number): Grams {
  if (!Number.isFinite(value)) {
    throw new WeightError(`kg() requires a finite number, got ${value}`);
  }
  return grams(Math.round(value * GRAMS_PER_KG));
}

export function toKg(weight: Grams): number {
  return weight / GRAMS_PER_KG;
}

export function addGrams(...weights: Grams[]): Grams {
  return grams(weights.reduce<number>((sum, w) => sum + w, 0));
}

export function subGrams(a: Grams, b: Grams): Grams {
  return grams(a - b);
}

export function scaleGrams(weight: Grams, factor: number): Grams {
  if (!Number.isFinite(factor)) {
    throw new WeightError(`scaleGrams() requires a finite factor, got ${factor}`);
  }
  return grams(Math.round(weight * factor));
}

/** The pack sizes Irice sells. Anything else is a data error, not a new case. */
export const PACK_SIZES_G = [kg(1), kg(5), kg(10), kg(20)] as const;

export function isSupportedPackSize(weight: Grams): boolean {
  return (PACK_SIZES_G as readonly Grams[]).includes(weight);
}

export interface FormatWeightOptions {
  persianDigits?: boolean;
  withLabel?: boolean;
}

/** Format for display: whole kilos read as "۱۰ کیلوگرم", sub-kilo as grams. */
export function formatWeight(weight: Grams, options: FormatWeightOptions = {}): string {
  const { persianDigits = true, withLabel = true } = options;
  const locale = persianDigits ? "fa-IR" : "en-US";
  const useKg = weight >= GRAMS_PER_KG;
  const value = useKg ? toKg(weight) : (weight as number);
  const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  if (!withLabel) return formatted;
  return `${formatted} ${useKg ? "کیلوگرم" : "گرم"}`;
}
