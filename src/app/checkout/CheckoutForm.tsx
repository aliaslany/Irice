"use client";

/**
 * Address selection, points redemption, and the final submit — the one
 * piece of the checkout page with real interactivity, so it's the one piece
 * that's a client component. Everything else on the page is server-rendered.
 */
import { useEffect, useState, useTransition } from "react";
import { Price } from "../../components/primitives";
import { placeOrderAction } from "../_actions/checkout-actions";
import { previewShippingAction, type ShippingPreview } from "../_actions/checkout-actions";

export interface CheckoutAddress {
  id: string;
  recipientName: string;
  province: string;
  city: string;
  line1: string;
}

export function CheckoutForm({
  cartId,
  addresses,
  defaultAddressId,
  maxPoints,
  maxDiscountRial,
  subtotalRial,
  totalWeightG,
  initialShipping,
}: {
  cartId: string;
  addresses: CheckoutAddress[];
  defaultAddressId: string | undefined;
  maxPoints: number;
  maxDiscountRial: number;
  subtotalRial: number;
  totalWeightG: number;
  initialShipping: ShippingPreview | null;
}) {
  const [addressId, setAddressId] = useState(defaultAddressId ?? "");
  const [redeemPoints, setRedeemPoints] = useState(false);
  const [shipping, setShipping] = useState(initialShipping);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Adding a customer's FIRST address flips `defaultAddressId` from
  // undefined to a real id on the next server render, but this component
  // instance stays mounted at the same position in the tree — React does
  // not re-run `useState`'s initializer on a prop change, only on mount. Sync
  // explicitly, or the submit button stays permanently disabled after adding
  // the address that was supposed to enable it.
  useEffect(() => {
    if (!addressId && defaultAddressId) {
      selectAddress(defaultAddressId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectAddress is stable across renders; including it would re-run this on every render.
  }, [defaultAddressId]);

  function selectAddress(id: string) {
    setAddressId(id);
    startTransition(async () => {
      const preview = await previewShippingAction(id, totalWeightG, subtotalRial);
      setShipping(preview);
    });
  }

  const totalRial = subtotalRial - (redeemPoints ? maxDiscountRial : 0) + (shipping?.isFree ? 0 : (shipping?.feeRial ?? 0));

  async function handleSubmit(formData: FormData) {
    setError(null);
    const result = await placeOrderAction(formData);
    // A successful call redirects server-side and never returns here; only a
    // handled DomainError produces a result object to show inline.
    if (result && !result.ok) setError(result.error ?? "خطایی رخ داد.");
  }

  return (
    <>
      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-4 font-semibold">آدرس ارسال</h2>
        {addresses.length === 0 ? (
          <p className="text-sm text-muted">ابتدا یک آدرس اضافه کنید.</p>
        ) : (
          <div className="space-y-2">
            {addresses.map((address) => (
              <label
                key={address.id}
                className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 ${
                  addressId === address.id ? "border-brand" : "border-line"
                }`}
              >
                <input
                  type="radio"
                  name="addressIdPreview"
                  checked={addressId === address.id}
                  onChange={() => selectAddress(address.id)}
                  className="mt-1"
                />
                <span className="text-sm">
                  <strong>{address.recipientName}</strong> — {address.province}، {address.city}
                  <br />
                  <span className="text-muted">{address.line1}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </section>

      {maxPoints > 0 && (
        <section className="rounded-lg border border-accent/40 bg-accent/5 p-5">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={redeemPoints}
              onChange={(e) => setRedeemPoints(e.target.checked)}
              className="mt-1"
            />
            <span className="text-sm">
              🏅 استفاده از امتیاز آیرایس شما: تا <strong className="tabular">{maxPoints.toLocaleString("fa-IR")}</strong>{" "}
              امتیاز، معادل <Price amountRial={maxDiscountRial} className="font-semibold text-accent" /> تخفیف.
            </span>
          </label>
        </section>
      )}

      <aside className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-4 font-semibold">مجموع</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">جمع کالاها</dt>
            <dd>
              <Price amountRial={subtotalRial} />
            </dd>
          </div>
          {redeemPoints && maxDiscountRial > 0 && (
            <div className="flex justify-between text-success">
              <dt>تخفیف امتیاز</dt>
              <dd>
                −<Price amountRial={maxDiscountRial} />
              </dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-muted">هزینه ارسال</dt>
            <dd>
              {!addressId ? (
                <span className="text-muted">پس از انتخاب آدرس</span>
              ) : shipping?.isFree ? (
                <span className="text-success">رایگان</span>
              ) : shipping ? (
                <Price amountRial={shipping.feeRial} />
              ) : (
                <span className="text-muted">…</span>
              )}
            </dd>
          </div>
          <div className="flex justify-between border-t border-line pt-2 font-semibold">
            <dt>مبلغ قابل پرداخت</dt>
            <dd>
              <Price amountRial={Math.max(0, totalRial)} />
            </dd>
          </div>
        </dl>

        <form action={handleSubmit} className="mt-4">
          <input type="hidden" name="cartId" value={cartId} />
          <input type="hidden" name="addressId" value={addressId} />
          <input type="hidden" name="pointsToRedeem" value={redeemPoints ? maxPoints : 0} />
          <button
            type="submit"
            disabled={!addressId || isPending}
            className="w-full rounded-md bg-brand px-4 py-3 font-semibold text-white transition hover:bg-brand-strong disabled:opacity-50"
          >
            پرداخت و ثبت سفارش
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </aside>
    </>
  );
}
