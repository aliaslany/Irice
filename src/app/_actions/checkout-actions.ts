"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "../../db/client";
import { addresses } from "../../db/schema/index";
import { loadEnv } from "../../globals/config";
import { DomainError } from "../../globals/errors";
import { rial } from "../../globals/money";
import { grams } from "../../globals/weight";
import { cancelOrder, placeOrder, retryPayment } from "../../modules/checkout/checkout";
import { quoteShipping } from "../../modules/shipping/rate";
import { zoneForProvince } from "../../modules/shipping/zones";
import { getCurrentCustomer } from "../lib/session";
import type { ActionResult } from "./identity-actions";

/**
 * Places the order and redirects straight to the payment gateway. A thrown
 * DomainError (out of stock, an address that vanished) is returned as a
 * message instead of raising, because `redirect()` inside the try below
 * would otherwise be swallowed by a catch — Next's redirect works by
 * throwing a special error, and it must be allowed to propagate.
 */
export async function placeOrderAction(formData: FormData): Promise<ActionResult> {
  const customer = await getCurrentCustomer();
  if (!customer) return { ok: false, error: "برای ثبت سفارش ابتدا وارد شوید." };

  const cartId = String(formData.get("cartId") ?? "");
  const addressId = String(formData.get("addressId") ?? "");
  const pointsToRedeem = Number(formData.get("pointsToRedeem") ?? 0) || 0;
  if (!cartId || !addressId) return { ok: false, error: "سبد خرید یا آدرس نامعتبر است." };

  const env = loadEnv();
  let redirectUrl: string;
  try {
    const result = await placeOrder({
      cartId,
      customerId: customer.id,
      addressId,
      pointsToRedeem,
      siteUrl: env.SITE_URL,
    });
    redirectUrl = result.redirectUrl;
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.messageFa };
    throw error;
  }

  // The gateway URL is absolute; our fake gateway's is same-origin. Either
  // way `redirect()` sends the browser there directly. The cart row itself
  // was already emptied by placeOrder; the cookie is left as-is for next time.
  redirect(redirectUrl);
}

export async function retryPaymentAction(formData: FormData): Promise<void> {
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return;
  const env = loadEnv();
  const { redirectUrl } = await retryPayment(orderId, env.SITE_URL);
  redirect(redirectUrl);
}

export async function cancelOrderAction(formData: FormData): Promise<void> {
  const customer = await getCurrentCustomer();
  if (!customer) return;
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return;
  await cancelOrder(orderId, customer.id);
  redirect(`/orders/${orderId}`);
}

export interface ShippingPreview {
  feeRial: number;
  isFree: boolean;
}

/** Recompute the shipping quote when the customer changes their selected address. */
export async function previewShippingAction(
  addressId: string,
  totalWeightG: number,
  subtotalRial: number,
): Promise<ShippingPreview | null> {
  const [address] = await db.select().from(addresses).where(eq(addresses.id, addressId));
  if (!address) return null;

  const quote = quoteShipping({
    totalWeightG: grams(totalWeightG),
    zone: zoneForProvince(address.province),
    subtotalRial: rial(subtotalRial),
    freeShippingThresholdRial: rial(loadEnv().FREE_SHIPPING_THRESHOLD_RIAL),
  });
  return { feeRial: quote.feeRial, isFree: quote.isFree };
}
