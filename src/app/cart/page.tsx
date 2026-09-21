import type { Metadata } from "next";
import { loadEnv } from "../../globals/config";
import { rial } from "../../globals/money";
import { freeShippingProgress } from "../../modules/shipping/rate";
import { Price, Weight } from "../../components/primitives";
import { getCartSummary, getCurrentCustomer } from "../lib/session";
import { removeCartItemAction, updateCartItemAction } from "../_actions/cart-actions";

export const metadata: Metadata = { title: "سبد خرید", robots: { index: false } };

export default async function CartPage() {
  const [{ lines, totals }, customer, env] = await Promise.all([
    getCartSummary(),
    getCurrentCustomer(),
    Promise.resolve(loadEnv()),
  ]);

  const progress = freeShippingProgress(totals.subtotalRial, rial(env.FREE_SHIPPING_THRESHOLD_RIAL));

  return (
    <>
      <h1 className="mb-6 text-2xl font-bold">سبد خرید</h1>

      {lines.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface p-8 text-center">
          <p className="text-muted">سبد خرید شما خالی است.</p>
          <a href="/" className="mt-4 inline-block text-brand hover:underline">
            مشاهده انواع برنج
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {env.FREE_SHIPPING_THRESHOLD_RIAL > 0 && (
              <div className="mb-4 rounded-lg border border-line bg-surface p-4">
                {progress.isFree ? (
                  <p className="text-sm font-medium text-success">🎉 ارسال این سفارش رایگان است!</p>
                ) : (
                  <>
                    <p className="mb-2 text-sm">
                      <Price amountRial={progress.remainingRial} className="font-semibold text-brand-strong" />{" "}
                      دیگر بخرید تا ارسال رایگان شود
                    </p>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                      <div
                        className="h-full rounded-full bg-brand transition-all"
                        style={{ width: `${progress.pct}%` }}
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            <ul className="space-y-3">
              {lines.map((line) => (
                <li
                  key={line.itemId}
                  className={`rounded-lg border bg-surface p-4 ${line.isAvailable ? "border-line" : "border-danger"}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{line.varietyNameFa}</p>
                      <p className="text-sm text-muted">
                        <Weight valueG={line.packSizeG} /> × {line.quantity}
                      </p>
                      {!line.isAvailable && (
                        <p className="mt-1 text-sm text-danger">این تعداد در حال حاضر موجود نیست.</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <form action={updateCartItemAction} className="flex items-center gap-1">
                        <input type="hidden" name="itemId" value={line.itemId} />
                        <select
                          name="quantity"
                          defaultValue={line.quantity}
                          className="rounded-md border border-line bg-surface px-2 py-1 text-sm"
                        >
                          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="text-xs text-brand hover:underline">
                          به‌روزرسانی
                        </button>
                      </form>
                      <form action={removeCartItemAction}>
                        <input type="hidden" name="itemId" value={line.itemId} />
                        <button type="submit" className="text-xs text-danger hover:underline">
                          حذف
                        </button>
                      </form>
                    </div>
                  </div>
                  <div className="mt-2 text-left">
                    <Price amountRial={line.lineTotalRial} className="font-semibold" />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <aside className="h-fit rounded-lg border border-line bg-surface p-5">
            <h2 className="mb-4 font-semibold">خلاصه سفارش</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">جمع کالاها ({totals.itemCount})</dt>
                <dd>
                  <Price amountRial={totals.subtotalRial} />
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">وزن کل</dt>
                <dd>
                  <Weight valueG={totals.totalWeightG} />
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted">هزینه ارسال در مرحله بعد بر اساس مقصد محاسبه می‌شود.</p>

            {totals.hasUnavailableLine ? (
              <p className="mt-4 rounded-md bg-danger/10 p-3 text-sm text-danger">
                برای ادامه، موارد ناموجود را از سبد حذف کنید.
              </p>
            ) : (
              <a
                href="/checkout"
                className="mt-4 block rounded-md bg-brand px-4 py-3 text-center font-semibold text-white transition hover:bg-brand-strong"
              >
                ادامه فرآیند خرید
              </a>
            )}

            {!customer && (
              <p className="mt-3 text-center text-xs text-muted">
                در مرحله بعد با شماره موبایل خود وارد می‌شوید.
              </p>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
