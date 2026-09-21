"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addresses, carts } from "../../db/schema/index";
import { db } from "../../db/client";
import { DomainError } from "../../globals/errors";
import { attachCustomerToCart } from "../../modules/cart/queries";
import { requestOtp, verifyOtp } from "../../modules/identity/queries";
import { defaultSmsSender } from "../../modules/identity/sms";
import { CART_COOKIE, clearSessionCookie, getCurrentCustomer, setSessionCookie } from "../lib/session";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function requestOtpAction(mobile: string): Promise<ActionResult> {
  try {
    await requestOtp(mobile, defaultSmsSender());
    return { ok: true };
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.messageFa };
    throw error;
  }
}

/** Verify the code, log the customer in, and fold their guest cart into their account. */
export async function verifyOtpAction(mobile: string, code: string): Promise<ActionResult> {
  try {
    const customer = await verifyOtp(mobile, code);
    await setSessionCookie(customer.id);

    const store = await cookies();
    const cartToken = store.get(CART_COOKIE)?.value;
    if (cartToken) {
      const [cart] = await db.select().from(carts).where(eq(carts.cartToken, cartToken));
      if (cart) await attachCustomerToCart(cart.id, customer.id);
    }

    revalidatePath("/checkout");
    revalidatePath("/account");
    return { ok: true };
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.messageFa };
    throw error;
  }
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/");
}

export async function addAddressAction(formData: FormData): Promise<ActionResult> {
  const customer = await getCurrentCustomer();
  if (!customer) return { ok: false, error: "برای افزودن آدرس ابتدا وارد شوید." };

  const recipientName = String(formData.get("recipientName") ?? "").trim();
  const recipientMobile = String(formData.get("recipientMobile") ?? "").trim();
  const province = String(formData.get("province") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const line1 = String(formData.get("line1") ?? "").trim();
  const postalCode = String(formData.get("postalCode") ?? "").trim() || null;

  if (!recipientName || !recipientMobile || !province || !city || !line1) {
    return { ok: false, error: "همه فیلدهای الزامی را پر کنید." };
  }

  await db.insert(addresses).values({
    customerId: customer.id,
    recipientName,
    recipientMobile,
    province,
    city,
    line1,
    postalCode,
  });
  revalidatePath("/checkout");
  return { ok: true };
}
