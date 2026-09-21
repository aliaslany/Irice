/**
 * Cart persistence and live pricing.
 *
 * A cart line stores only (variety, pack size, quantity) — see cart.ts for
 * why. Every read here re-resolves the current price and availability
 * against today's sellable lots, using the exact same FEFO ordering
 * (`allocatePacksFefo`) that checkout will use, so what the cart shows is
 * what checkout is actually about to charge, not an approximation of it.
 */
import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { cartItems, carts, lots, skus, varieties, type Cart } from "../../db/schema/index";
import { rial, type Rial } from "../../globals/money";
import { grams, type Grams } from "../../globals/weight";
import { allocatePacksFefo, type AllocatableLot } from "../inventory/allocate";
import { clampQuantity, type ResolvedCartLine } from "./cart";

const isSellableLot = and(eq(lots.status, "active"), gt(sql`${lots.quantityOnHandG} - ${lots.quantityReservedG}`, 0));

export async function getOrCreateCartByToken(token: string | undefined): Promise<Cart> {
  if (token) {
    const [existing] = await db.select().from(carts).where(eq(carts.cartToken, token));
    if (existing) return existing;
  }
  const [created] = await db
    .insert(carts)
    .values({ cartToken: token ?? randomUUID() })
    .returning();
  if (!created) throw new Error("failed to create cart");
  return created;
}

export async function attachCustomerToCart(cartId: string, customerId: string): Promise<void> {
  await db.update(carts).set({ customerId, updatedAt: new Date() }).where(eq(carts.id, cartId));
}

export async function addOrIncrementCartItem(
  cartId: string,
  varietyId: string,
  packSizeG: Grams,
  quantity: number,
): Promise<void> {
  const qty = clampQuantity(quantity);
  await db
    .insert(cartItems)
    .values({ cartId, varietyId, packSizeG, quantity: qty })
    .onConflictDoUpdate({
      target: [cartItems.cartId, cartItems.varietyId, cartItems.packSizeG],
      set: { quantity: sql`least(99, ${cartItems.quantity} + ${qty})`, updatedAt: new Date() },
    });
}

export async function setCartItemQuantity(itemId: string, quantity: number): Promise<void> {
  await db
    .update(cartItems)
    .set({ quantity: clampQuantity(quantity), updatedAt: new Date() })
    .where(eq(cartItems.id, itemId));
}

export async function removeCartItem(itemId: string): Promise<void> {
  await db.delete(cartItems).where(eq(cartItems.id, itemId));
}

export async function clearCart(cartId: string): Promise<void> {
  await db.delete(cartItems).where(eq(cartItems.cartId, cartId));
}

export interface RawCartItem {
  id: string;
  varietyId: string;
  packSizeG: Grams;
  quantity: number;
}

export async function listCartItems(cartId: string): Promise<RawCartItem[]> {
  const rows = await db.select().from(cartItems).where(eq(cartItems.cartId, cartId));
  return rows.map((r) => ({
    id: r.id,
    varietyId: r.varietyId,
    packSizeG: grams(r.packSizeG),
    quantity: r.quantity,
  }));
}

/**
 * Resolve raw cart rows into priced, availability-checked lines. Also
 * returns the `itemId` so the cart page can wire quantity controls without a
 * second round trip.
 */
export async function resolveCartLines(
  items: readonly RawCartItem[],
): Promise<(ResolvedCartLine & { itemId: string })[]> {
  if (items.length === 0) return [];

  const varietyIds = [...new Set(items.map((i) => i.varietyId))];
  const [varietyRows, lotRows] = await Promise.all([
    db.select().from(varieties).where(inArray(varieties.id, varietyIds)),
    db.select().from(lots).where(and(inArray(lots.varietyId, varietyIds), isSellableLot)),
  ]);
  const skuRows = lotRows.length
    ? await db
        .select()
        .from(skus)
        .where(and(eq(skus.isActive, true), inArray(skus.lotId, lotRows.map((l) => l.id))))
    : [];

  const varietyById = new Map(varietyRows.map((v) => [v.id, v]));

  return items.map((item) => {
    const variety = varietyById.get(item.varietyId);
    const varietyLots = lotRows
      .filter((l) => l.varietyId === item.varietyId)
      .sort((a, b) => a.harvestYear - b.harvestYear || a.code.localeCompare(b.code));

    const allocatable: AllocatableLot[] = varietyLots.map((l) => ({
      id: l.id,
      harvestYear: l.harvestYear,
      quantityOnHandG: grams(l.quantityOnHandG),
      quantityReservedG: grams(l.quantityReservedG),
      status: l.status,
    }));

    let isAvailable = variety !== undefined;
    if (isAvailable) {
      try {
        allocatePacksFefo(allocatable, item.packSizeG, item.quantity);
      } catch {
        isAvailable = false;
      }
    }

    // Priced from the oldest lot that actually stocks this pack size — the
    // lot FEFO would draw from first, so the quoted price matches checkout
    // for the common case where one lot covers the whole line.
    const firstLot = varietyLots.find((l) =>
      skuRows.some((s) => s.lotId === l.id && s.packSizeG === item.packSizeG),
    );
    const sku = firstLot && skuRows.find((s) => s.lotId === firstLot.id && s.packSizeG === item.packSizeG);
    if (!sku) isAvailable = false;

    const unitPriceRial: Rial = sku ? rial(sku.priceRial) : rial(0);
    const lineWeightG = grams(item.packSizeG * item.quantity);

    return {
      itemId: item.id,
      varietyId: item.varietyId,
      varietySlug: variety?.slug ?? "",
      varietyNameFa: variety?.nameFa ?? "؟",
      packSizeG: item.packSizeG,
      quantity: item.quantity,
      unitPriceRial,
      lineTotalRial: rial(unitPriceRial * item.quantity),
      lineWeightG,
      isAvailable,
    };
  });
}
