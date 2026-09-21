"use server";

import { revalidatePath } from "next/cache";
import { ensureCartWithCookie } from "../lib/session";
import {
  addOrIncrementCartItem,
  removeCartItem,
  setCartItemQuantity,
} from "../../modules/cart/queries";
import { grams } from "../../globals/weight";

export async function addToCartAction(formData: FormData): Promise<void> {
  const varietyId = String(formData.get("varietyId") ?? "");
  const packSizeG = Number(formData.get("packSizeG"));
  const quantity = Number(formData.get("quantity") ?? 1);
  if (!varietyId || !Number.isFinite(packSizeG) || packSizeG <= 0) return;

  const cart = await ensureCartWithCookie();
  await addOrIncrementCartItem(cart.id, varietyId, grams(packSizeG), quantity);
  revalidatePath("/cart");
  revalidatePath("/", "layout"); // header cart-count badge
}

export async function updateCartItemAction(formData: FormData): Promise<void> {
  const itemId = String(formData.get("itemId") ?? "");
  const quantity = Number(formData.get("quantity"));
  if (!itemId || !Number.isFinite(quantity)) return;
  await setCartItemQuantity(itemId, quantity);
  revalidatePath("/cart");
  revalidatePath("/", "layout");
}

export async function removeCartItemAction(formData: FormData): Promise<void> {
  const itemId = String(formData.get("itemId") ?? "");
  if (!itemId) return;
  await removeCartItem(itemId);
  revalidatePath("/cart");
  revalidatePath("/", "layout");
}
