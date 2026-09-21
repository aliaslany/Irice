import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "../../db/client";
import { addresses } from "../../db/schema/index";
import { loadEnv } from "../../globals/config";
import { rial } from "../../globals/money";
import { maxRedeemablePoints, redemptionValueRial } from "../../modules/loyalty/points";
import { quoteShipping } from "../../modules/shipping/rate";
import { zoneForProvince } from "../../modules/shipping/zones";
import { Price, Weight } from "../../components/primitives";
import { getCartSummary, getCurrentCustomer } from "../lib/session";
import { addAddressAction } from "../_actions/identity-actions";
import { CheckoutForm } from "./CheckoutForm";
import { OtpLogin } from "./OtpLogin";

export const metadata: Metadata = { title: "تسویه‌حساب", robots: { index: false } };

/**
 * A void-returning wrapper: `addAddressAction` returns an ActionResult for
 * callers that want the error message, but a plain progressively-enhanced
 * `<form action={...}>` (no client JS reading the result) is typed to expect
 * void — this page doesn't currently surface a validation error from this
 * particular form, so the wrapper is the honest way to satisfy that shape
 * rather than casting it away.
 */
async function addAddressFormAction(formData: FormData): Promise<void> {
  "use server";
  await addAddressAction(formData);
}

export default async function CheckoutPage() {
  const { cartId, lines, totals } = await getCartSummary();
  if (!cartId || lines.length === 0) redirect("/cart");
  if (totals.hasUnavailableLine) redirect("/cart");

  const customer = await getCurrentCustomer();

  if (!customer) {
    return (
      <div className="mx-auto max-w-md">
        <h1 className="mb-6 text-2xl font-bold">تسویه‌حساب</h1>
        <OtpLogin isDev={loadEnv().ALLOW_DEV_OTP_PEEK} />
      </div>
    );
  }

  const env = loadEnv();
  const customerAddresses = await db.select().from(addresses).where(eq(addresses.customerId, customer.id));
  const defaultAddress = customerAddresses.find((a) => a.isDefault) ?? customerAddresses[0];

  const maxPoints = maxRedeemablePoints(totals.subtotalRial, customer.pointsBalanceCache);
  const maxDiscountRial = redemptionValueRial(maxPoints);

  const initialShipping = defaultAddress
    ? quoteShipping({
        totalWeightG: totals.totalWeightG,
        zone: zoneForProvince(defaultAddress.province),
        subtotalRial: totals.subtotalRial,
        freeShippingThresholdRial: rial(env.FREE_SHIPPING_THRESHOLD_RIAL),
      })
    : null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <h1 className="text-2xl font-bold">تسویه‌حساب</h1>

        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="mb-3 font-semibold">اقلام سفارش</h2>
          <ul className="divide-y divide-line">
            {lines.map((line) => (
              <li key={line.itemId} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {line.varietyNameFa} — <Weight valueG={line.packSizeG} /> × {line.quantity}
                </span>
                <Price amountRial={line.lineTotalRial} />
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-line bg-surface p-5">
          <details>
            <summary className="cursor-pointer font-semibold">+ افزودن آدرس جدید</summary>
            <form action={addAddressFormAction} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input name="recipientName" placeholder="نام گیرنده" required className="rounded-md border border-line px-3 py-2" />
              <input
                name="recipientMobile"
                placeholder="موبایل گیرنده (۰۹…)"
                required
                dir="ltr"
                className="ltr-run rounded-md border border-line px-3 py-2"
              />
              <input name="province" placeholder="استان" required className="rounded-md border border-line px-3 py-2" />
              <input name="city" placeholder="شهر" required className="rounded-md border border-line px-3 py-2" />
              <input
                name="line1"
                placeholder="آدرس کامل"
                required
                className="sm:col-span-2 rounded-md border border-line px-3 py-2"
              />
              <input name="postalCode" placeholder="کد پستی (اختیاری)" className="rounded-md border border-line px-3 py-2" />
              <button type="submit" className="rounded-md bg-brand px-4 py-2 font-semibold text-white sm:col-span-2">
                ذخیره آدرس
              </button>
            </form>
          </details>
        </section>
      </div>

      {/* The interactive half — address choice, points, live total, submit —
          is one client component so picking an address can update the
          shipping quote without a full page round trip. */}
      <div className="space-y-6">
        <CheckoutForm
          cartId={cartId}
          addresses={customerAddresses.map((a) => ({
            id: a.id,
            recipientName: a.recipientName,
            province: a.province,
            city: a.city,
            line1: a.line1,
          }))}
          defaultAddressId={defaultAddress?.id}
          maxPoints={maxPoints}
          maxDiscountRial={maxDiscountRial}
          subtotalRial={totals.subtotalRial}
          totalWeightG={totals.totalWeightG}
          initialShipping={initialShipping ? { feeRial: initialShipping.feeRial, isFree: initialShipping.isFree } : null}
        />
      </div>
    </div>
  );
}
