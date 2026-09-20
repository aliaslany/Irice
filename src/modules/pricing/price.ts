/**
 * Pricing.
 *
 * Pure functions, no I/O, so the money rules are exhaustively testable.
 *
 * The rule: a SKU price is always DERIVED from its lot's rial-per-kilogram
 * plus a packaging fee. Nobody types a pack price by hand. When the market
 * moves — and in this market it moves weekly — an operator updates one number
 * on the lot and every pack size recalculates.
 */
import { addRial, mulRatioRial, rial, type Rial } from "../../globals/money.js";
import { GRAMS_PER_KG, type Grams } from "../../globals/weight.js";

export interface PriceInput {
  /** The lot's price per kilogram, in rial. */
  pricePerKgRial: Rial;
  /** Pack size in grams. */
  packSizeG: Grams;
  /** Flat per-pack packaging/handling fee, in rial. */
  packagingFeeRial?: Rial;
}

export interface PriceBreakdown {
  /** price_per_kg × weight, before the packaging fee. */
  riceRial: Rial;
  packagingRial: Rial;
  /** What the customer pays for one pack. */
  totalRial: Rial;
  /** Effective rial/kg including packaging — the honest comparison number. */
  effectivePerKgRial: Rial;
}

/**
 * Derive a pack price.
 *
 * Rounding is `ceil` on the rice component: under-charging by a rial on every
 * bag is a silent margin leak, and Iranian price points are rounded to
 * thousands of rial anyway (see {@link roundToDisplayStep}).
 */
export function derivePrice(input: PriceInput): PriceBreakdown {
  const packaging = input.packagingFeeRial ?? rial(0);
  // Integer ratio math, not `pricePerKg * (grams/1000)`: see mulRatioRial.
  const riceRial = mulRatioRial(input.pricePerKgRial, input.packSizeG, GRAMS_PER_KG, "ceil");
  const totalRial = addRial(riceRial, packaging);
  const effectivePerKgRial = mulRatioRial(totalRial, GRAMS_PER_KG, input.packSizeG, "ceil");
  return { riceRial, packagingRial: packaging, totalRial, effectivePerKgRial };
}

/**
 * Round a price up to a clean display step. Iranian storefronts quote prices in
 * whole thousands of Toman (= 10,000 rial); a price of ۵٬۹۳۴٬۲۱۷ تومان reads as
 * a mistake, not as precision.
 */
export function roundToDisplayStep(amount: Rial, stepRial: Rial = rial(10_000)): Rial {
  if (stepRial <= 0) throw new RangeError("stepRial must be positive");
  return rial(Math.ceil(amount / stepRial) * stepRial);
}

/** Price every supported pack size of a lot in one pass. */
export function priceLotPacks(
  pricePerKgRial: Rial,
  packSizes: readonly Grams[],
  packagingFeeFor: (packSizeG: Grams) => Rial = () => rial(0),
): Map<Grams, PriceBreakdown> {
  const out = new Map<Grams, PriceBreakdown>();
  for (const packSizeG of packSizes) {
    out.set(
      packSizeG,
      derivePrice({ pricePerKgRial, packSizeG, packagingFeeRial: packagingFeeFor(packSizeG) }),
    );
  }
  return out;
}

/**
 * Percentage change between two prices, for the price-history chart.
 * Positive means the price rose.
 */
export function priceChangePct(from: Rial, to: Rial): number {
  if (from === 0) throw new RangeError("cannot compute a change from a zero price");
  return ((to - from) / from) * 100;
}
