import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db } from "../../../db/client";
import { orderLines, orders, payments } from "../../../db/schema/index";
import { badgeDefinition } from "../../../modules/loyalty/badges";
import { Price, Weight } from "../../../components/primitives";
import { formatJalali } from "../../../globals/date";
import { toPersianDigits } from "../../../globals/digits";
import { getCurrentCustomer } from "../../lib/session";
import { cancelOrderAction, retryPaymentAction } from "../../_actions/checkout-actions";
import { checkReturnEligibility } from "../../../modules/returns/eligibility";
import { getReturnRequestForOrder } from "../../../modules/returns/returns";
import { ReturnRequestForm } from "./ReturnRequestForm";

export const metadata: Metadata = { title: "جزئیات سفارش", robots: { index: false } };

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pointsEarned?: string; newBadges?: string }>;
}

const STATUS_LABEL_FA: Record<string, string> = {
  pending_payment: "در انتظار پرداخت",
  paid: "پرداخت‌شده — در حال آماده‌سازی",
  payment_failed: "پرداخت ناموفق",
  fulfilled: "ارسال‌شده",
  cancelled: "لغوشده",
  returned: "مرجوع‌شده",
};

const STATUS_TONE: Record<string, string> = {
  pending_payment: "bg-accent/15 text-accent",
  paid: "bg-success/12 text-success",
  payment_failed: "bg-danger/10 text-danger",
  fulfilled: "bg-success/12 text-success",
  cancelled: "bg-surface-sunken text-muted",
  returned: "bg-surface-sunken text-muted",
};

const RETURN_STATUS_LABEL_FA: Record<string, string> = {
  requested: "درخواست شما در حال بررسی است.",
  approved: "درخواست شما تأیید شد.",
  rejected: "درخواست شما رد شد.",
  completed: "این سفارش مرجوع و مبلغ آن بازگردانده شد.",
};

export default async function OrderPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { pointsEarned, newBadges } = await searchParams;

  const customer = await getCurrentCustomer();
  if (!customer) redirect("/checkout");

  const [order] = await db.select().from(orders).where(eq(orders.id, id));
  if (!order || order.customerId !== customer.id) notFound();

  const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, id));
  const paymentAttempts = await db.select().from(payments).where(eq(payments.orderId, id));
  const latestPayment = paymentAttempts[paymentAttempts.length - 1];

  const returnRequest = await getReturnRequestForOrder(order.id);
  const returnEligibility = checkReturnEligibility(order, returnRequest?.resolvedAt == null && returnRequest !== null);

  const unlockedBadges = (newBadges ?? "")
    .split(",")
    .filter(Boolean)
    .map((code) => badgeDefinition(code))
    .filter((b): b is NonNullable<typeof b> => b !== undefined);

  return (
    <div className="mx-auto max-w-2xl">
      {(pointsEarned || unlockedBadges.length > 0) && (
        <div className="mb-6 rounded-lg border-2 border-accent bg-accent/10 p-5 text-center">
          <p className="text-lg font-bold">🎉 سفارش شما با موفقیت پرداخت شد!</p>
          {pointsEarned && Number(pointsEarned) > 0 && (
            <p className="mt-2 tabular">
              <strong>{toPersianDigits(pointsEarned)}</strong> امتیاز آیرایس به حساب شما اضافه شد.
            </p>
          )}
          {unlockedBadges.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-semibold">نشان‌های تازه در پاسپورت برنج شما:</p>
              <div className="flex flex-wrap justify-center gap-3">
                {unlockedBadges.map((badge) => (
                  <div key={badge.code} className="rounded-lg border border-accent bg-surface px-4 py-3 text-center">
                    <div className="text-2xl">{badge.icon}</div>
                    <div className="mt-1 text-sm font-semibold">{badge.labelFa}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <a href="/account" className="mt-4 inline-block text-sm text-brand hover:underline">
            مشاهده پاسپورت برنج من ←
          </a>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted">سفارش</p>
          <h1 className="ltr-run text-2xl font-bold">{order.orderNumber}</h1>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_TONE[order.status] ?? ""}`}>
          {STATUS_LABEL_FA[order.status] ?? order.status}
        </span>
      </div>

      <section className="mb-6 rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-3 font-semibold">اقلام</h2>
        <ul className="divide-y divide-line">
          {lines.map((line) => (
            <li key={line.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                <Weight valueG={line.packSizeG} /> × {toPersianDigits(String(line.packs))}
              </span>
              <Price amountRial={line.lineTotalRial} />
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">جمع کالاها</dt>
            <dd>
              <Price amountRial={order.subtotalRial} />
            </dd>
          </div>
          {order.discountRial > 0 && (
            <div className="flex justify-between text-success">
              <dt>تخفیف امتیاز</dt>
              <dd>
                −<Price amountRial={order.discountRial} />
              </dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-muted">هزینه ارسال</dt>
            <dd>{order.shippingFeeRial === 0 ? "رایگان" : <Price amountRial={order.shippingFeeRial} />}</dd>
          </div>
          <div className="flex justify-between font-semibold">
            <dt>مبلغ پرداختی</dt>
            <dd>
              <Price amountRial={order.totalRial} />
            </dd>
          </div>
        </dl>
      </section>

      <section className="mb-6 rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-3 font-semibold">آدرس ارسال</h2>
        <p className="text-sm">
          {order.shipRecipientName} — {order.shipProvince}، {order.shipCity}
          <br />
          <span className="text-muted">{order.shipLine1}</span>
        </p>
      </section>

      {order.status === "payment_failed" && (
        <form action={retryPaymentAction} className="mb-4">
          <input type="hidden" name="orderId" value={order.id} />
          <button type="submit" className="w-full rounded-md bg-brand px-4 py-3 font-semibold text-white">
            تلاش دوباره برای پرداخت
          </button>
        </form>
      )}

      {(order.status === "pending_payment" || order.status === "payment_failed") && (
        <form action={cancelOrderAction}>
          <input type="hidden" name="orderId" value={order.id} />
          <button type="submit" className="w-full rounded-md border border-danger px-4 py-2 text-sm text-danger">
            لغو سفارش
          </button>
        </form>
      )}

      {returnRequest ? (
        <div className="mb-4 rounded-lg border border-line bg-surface-sunken p-4 text-sm">
          <p className="font-medium">{RETURN_STATUS_LABEL_FA[returnRequest.status] ?? returnRequest.status}</p>
          {returnRequest.resolutionNote && <p className="mt-1 text-muted">{returnRequest.resolutionNote}</p>}
        </div>
      ) : (
        returnEligibility.eligible && (
          <div className="mb-4">
            <ReturnRequestForm orderId={order.id} />
          </div>
        )
      )}

      {latestPayment?.status === "failed" && latestPayment.failureReason && (
        <p className="mt-3 text-sm text-danger">دلیل: {latestPayment.failureReason}</p>
      )}

      {order.paidAt && <p className="mt-4 text-xs text-muted">پرداخت‌شده در {formatJalali(order.paidAt)}</p>}
    </div>
  );
}
