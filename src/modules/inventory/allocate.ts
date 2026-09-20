/**
 * Lot allocation (FEFO).
 *
 * Pure. Given the sellable lots of a variety and a required weight, decide
 * which lots fill the order and in what amounts.
 *
 * The ordering rule is **first-expiring-first-out by harvest year**: the oldest
 * crop ships first. Rice does not spoil on a date, it ages, and an aged lot
 * loses value every month it sits — so oldest-first is both the inventory
 * policy and the honest one. A lot that is deliberately sold as aged is
 * modelled by its grade and price, not by holding it back.
 */
import { DomainError } from "../../globals/errors.js";
import { grams, type Grams } from "../../globals/weight.js";

export interface AllocatableLot {
  id: string;
  /** Jalali harvest year; lower is older and ships first. */
  harvestYear: number;
  quantityOnHandG: Grams;
  quantityReservedG: Grams;
  /** Only `active` lots are allocatable; callers should pre-filter, but we re-check. */
  status: string;
}

export interface Allocation {
  lotId: string;
  quantityG: Grams;
}

/** Stock a lot can still promise: on hand minus what is already held. */
export function availableG(lot: AllocatableLot): Grams {
  const free = lot.quantityOnHandG - lot.quantityReservedG;
  return grams(Math.max(0, free));
}

export function isAllocatable(lot: AllocatableLot): boolean {
  return lot.status === "active" && availableG(lot) > 0;
}

/**
 * Allocate `requiredG` across lots, oldest harvest first.
 *
 * Throws `OUT_OF_STOCK` when the lots cannot cover the requirement; it never
 * returns a partial allocation, because a half-filled cart line is a worse
 * customer experience than an honest "ناموجود" and a much worse ops problem.
 */
export function allocateFefo(lots: readonly AllocatableLot[], requiredG: Grams): Allocation[] {
  if (requiredG <= 0) {
    throw new DomainError("VALIDATION", "requiredG must be positive", { requiredG });
  }

  const candidates = lots
    .filter(isAllocatable)
    // Oldest harvest first; ties broken by id so allocation is deterministic
    // and two concurrent carts contend on the same row rather than deadlocking
    // by locking the same two lots in opposite orders.
    .sort((a, b) => a.harvestYear - b.harvestYear || a.id.localeCompare(b.id));

  const totalAvailable = candidates.reduce((sum, lot) => sum + availableG(lot), 0);
  if (totalAvailable < requiredG) {
    throw new DomainError("OUT_OF_STOCK", "insufficient stock across lots", {
      requiredG,
      availableG: totalAvailable,
    });
  }

  const allocations: Allocation[] = [];
  let remaining: number = requiredG;
  for (const lot of candidates) {
    if (remaining === 0) break;
    const take = Math.min(availableG(lot), remaining);
    if (take === 0) continue;
    allocations.push({ lotId: lot.id, quantityG: grams(take) });
    remaining -= take;
  }
  return allocations;
}

/**
 * The lot a single pack should be cut from — the common case, and the one the
 * product page needs in order to show "this bag is from lot X, harvest 1405".
 */
export function preferredLot(
  lots: readonly AllocatableLot[],
  packSizeG: Grams,
): AllocatableLot | null {
  return (
    lots
      .filter((lot) => isAllocatable(lot) && availableG(lot) >= packSizeG)
      .sort((a, b) => a.harvestYear - b.harvestYear || a.id.localeCompare(b.id))[0] ?? null
  );
}
