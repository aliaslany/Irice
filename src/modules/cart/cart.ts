/**
 * Cart math.
 *
 * Pure. A cart line is a Variety + pack size (never a Sku or a Lot — see
 * docs/ARCHITECTURE.md), so its price is a live quote resolved against
 * whatever lot is currently cheapest/oldest, not something the cart stores.
 * The DB-backed half of this module (queries.ts) resolves that price; this
 * file only adds up numbers it's handed.
 */
import { addRial, rial, type Rial } from "../../globals/money";
import { addGrams, grams, type Grams } from "../../globals/weight";

export interface ResolvedCartLine {
  varietyId: string;
  varietySlug: string;
  varietyNameFa: string;
  packSizeG: Grams;
  quantity: number;
  /** Live per-pack price, resolved from the variety's current cheapest lot. */
  unitPriceRial: Rial;
  lineTotalRial: Rial;
  lineWeightG: Grams;
  /** False when no sellable lot currently covers this line's quantity. */
  isAvailable: boolean;
}

export interface CartTotals {
  subtotalRial: Rial;
  totalWeightG: Grams;
  /** Count of packs across all lines, for a "۷ کالا در سبد" style summary. */
  itemCount: number;
  hasUnavailableLine: boolean;
}

export function computeCartTotals(lines: readonly ResolvedCartLine[]): CartTotals {
  return {
    subtotalRial: addRial(...lines.map((l) => l.lineTotalRial), rial(0)),
    totalWeightG: addGrams(...lines.map((l) => l.lineWeightG), grams(0)),
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
    hasUnavailableLine: lines.some((l) => !l.isAvailable),
  };
}

/** The next legal quantity for a line, clamped to a sane manual-entry range. */
export function clampQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return 1;
  return Math.min(99, Math.max(1, Math.round(quantity)));
}
