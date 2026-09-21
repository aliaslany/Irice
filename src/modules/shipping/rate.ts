/**
 * Weight-first shipping quotes.
 *
 * Pure. docs/ARCHITECTURE.md is explicit that shipping must price on
 * `f(total_grams, destination_zone)`, not per line item — a 20kg bag *is*
 * the cost model, and pricing shipping per cart line would let a customer
 * split one order into several to dodge the weight-based fee.
 */
import { addRial, mulRatioRial, rial, subRial, type Rial } from "../../globals/money";
import { GRAMS_PER_KG, type Grams } from "../../globals/weight";
import type { ShippingZone } from "./zones";

export interface ShippingQuote {
  feeRial: Rial;
  isFree: boolean;
  /** How much more the customer would need to spend to earn free shipping, or null if already free/inapplicable. */
  remainingToFreeRial: Rial | null;
}

export interface QuoteShippingInput {
  totalWeightG: Grams;
  zone: ShippingZone;
  subtotalRial: Rial;
  /** 0 disables the free-shipping threshold entirely. */
  freeShippingThresholdRial: Rial;
}

export function quoteShipping(input: QuoteShippingInput): ShippingQuote {
  const { totalWeightG, zone, subtotalRial, freeShippingThresholdRial } = input;

  const raw = addRial(
    zone.baseFeeRial,
    mulRatioRial(zone.perKgRial, totalWeightG, GRAMS_PER_KG, "ceil"),
  );

  const qualifiesForFree = freeShippingThresholdRial > 0 && subtotalRial >= freeShippingThresholdRial;
  const feeRial = qualifiesForFree ? rial(0) : raw;

  const remainingToFreeRial =
    freeShippingThresholdRial > 0 && !qualifiesForFree
      ? subRial(freeShippingThresholdRial, subtotalRial)
      : null;

  return { feeRial, isFree: qualifiesForFree, remainingToFreeRial };
}

export interface FreeShippingProgress {
  isFree: boolean;
  remainingRial: Rial;
  /** 0–100, for a progress bar. Always 100 once free, regardless of threshold. */
  pct: number;
}

/**
 * How close the cart is to free shipping — independent of destination zone,
 * since the threshold and subtotal are all this needs. Split out from
 * {@link quoteShipping} so the cart page (which doesn't know the shipping
 * address yet) can render the progress bar without a zone.
 */
export function freeShippingProgress(subtotalRial: Rial, thresholdRial: Rial): FreeShippingProgress {
  if (thresholdRial <= 0) return { isFree: false, remainingRial: rial(0), pct: 0 };
  if (subtotalRial >= thresholdRial) return { isFree: true, remainingRial: rial(0), pct: 100 };
  return {
    isFree: false,
    remainingRial: subRial(thresholdRial, subtotalRial),
    pct: Math.floor((subtotalRial / thresholdRial) * 100),
  };
}
