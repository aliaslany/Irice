import type { Metadata } from "next";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "../../db/client";
import { customerBadges, orderLines, orders, varieties } from "../../db/schema/index";
import { BADGE_CATALOG } from "../../modules/loyalty/badges";
import { kgToNextTier, tierLabelFa, computeTier } from "../../modules/loyalty/tier";
import { Price } from "../../components/primitives";
import { formatMoney, rial } from "../../globals/money";
import { formatJalali } from "../../globals/date";
import { toPersianDigits } from "../../globals/digits";
import { getCurrentCustomer } from "../lib/session";
import { logoutAction } from "../_actions/identity-actions";

export const metadata: Metadata = { title: "پاسپورت برنج من", robots: { index: false } };

const STATUS_LABEL_FA: Record<string, string> = {
  pending_payment: "در انتظار پرداخت",
  paid: "پرداخت‌شده",
  payment_failed: "پرداخت ناموفق",
  fulfilled: "ارسال‌شده",
  cancelled: "لغوشده",
  returned: "مرجوع‌شده",
};

export default async function AccountPage() {
  const customer = await getCurrentCustomer();
  if (!customer) redirect("/checkout");

  const [unlockedBadges, orderHistory, publishedVarieties] = await Promise.all([
    db.select().from(customerBadges).where(eq(customerBadges.customerId, customer.id)),
    db.select().from(orders).where(eq(orders.customerId, customer.id)).orderBy(desc(orders.createdAt)),
    db.select().from(varieties).where(eq(varieties.isPublished, true)),
  ]);

  const unlockedCodes = new Set(unlockedBadges.map((b) => b.badgeCode));
  const tier = computeTier(customer.totalKgPurchasedCache);
  const nextTier = kgToNextTier(customer.totalKgPurchasedCache);
  // Rough progress toward the next tier for the bar — 0% at the last
  // threshold crossed, 100% at the next one.
  const tierPct = nextTier
    ? Math.min(100, Math.round(((customer.totalKgPurchasedCache) / (customer.totalKgPurchasedCache + nextTier.remainingKg)) * 100))
    : 100;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">🎫 پاسپورت برنج من</h1>
        <form action={logoutAction}>
          <button type="submit" className="text-sm text-muted hover:underline">
            خروج
          </button>
        </form>
      </div>

      {/* --- Stat row: points, tier, streak --- */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-line bg-surface p-4 text-center">
          <p className="text-sm text-muted">امتیاز آیرایس</p>
          <p className="tabular mt-1 text-2xl font-bold text-accent">
            {customer.pointsBalanceCache.toLocaleString("fa-IR")}
          </p>
          <p className="mt-1 text-xs text-muted">≈ {formatMoney(rial(customer.pointsBalanceCache * 500), { unit: "toman" })}</p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4 text-center">
          <p className="text-sm text-muted">رده مشتری</p>
          <p className="mt-1 text-2xl font-bold">{tierLabelFa(tier)}</p>
          <p className="tabular mt-1 text-xs text-muted">{toPersianDigits(String(customer.totalKgPurchasedCache))} کیلوگرم خرید تجمعی</p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4 text-center">
          <p className="text-sm text-muted">جریان خرید</p>
          <p className="mt-1 text-2xl font-bold">
            🔥 {toPersianDigits(String(customer.currentStreakMonths))} <span className="text-base font-normal">ماه</span>
          </p>
          <p className="tabular mt-1 text-xs text-muted">رکورد: {toPersianDigits(String(customer.longestStreakMonths))} ماه</p>
        </div>
      </div>

      {nextTier && (
        <div className="mb-8 rounded-lg border border-line bg-surface p-4">
          <p className="mb-2 text-sm">
            <span className="tabular">{toPersianDigits(nextTier.remainingKg.toFixed(1))}</span> کیلوگرم دیگر تا رده{" "}
            <strong>{tierLabelFa(nextTier.nextTier)}</strong>
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${tierPct}%` }} />
          </div>
        </div>
      )}

      {/* --- Variety stamps: the "passport" itself --- */}
      <section className="mb-8">
        <h2 className="mb-3 font-semibold">مُهرهای انواع برنج</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {publishedVarieties.map((variety) => (
            <VarietyStamp key={variety.id} nameFa={variety.nameFa} customerId={customer.id} varietyId={variety.id} />
          ))}
        </div>
      </section>

      {/* --- Badge grid: unlocked vs. locked --- */}
      <section className="mb-8">
        <h2 className="mb-3 font-semibold">نشان‌ها</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {BADGE_CATALOG.map((badge) => {
            const unlocked = unlockedCodes.has(badge.code);
            const unlockedAt = unlockedBadges.find((b) => b.badgeCode === badge.code)?.unlockedAt;
            return (
              <div
                key={badge.code}
                className={`rounded-lg border p-4 text-center ${
                  unlocked ? "border-accent bg-accent/5" : "border-line bg-surface-sunken opacity-50"
                }`}
              >
                <div className="text-2xl">{unlocked ? badge.icon : "🔒"}</div>
                <div className="mt-1 text-sm font-semibold">{badge.labelFa}</div>
                <div className="mt-1 text-xs text-muted">{badge.descriptionFa}</div>
                {unlocked && unlockedAt && (
                  <div className="mt-1 text-xs text-success">{formatJalali(unlockedAt, { style: "numeric" })}</div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* --- Order history --- */}
      <section>
        <h2 className="mb-3 font-semibold">سفارش‌های من</h2>
        {orderHistory.length === 0 ? (
          <p className="text-sm text-muted">هنوز سفارشی ثبت نکرده‌اید.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {orderHistory.map((order) => (
              <li key={order.id} className="flex items-center justify-between p-4 text-sm">
                <div>
                  <a href={`/orders/${order.id}`} className="ltr-run font-semibold text-brand hover:underline">
                    {order.orderNumber}
                  </a>
                  <p className="text-xs text-muted">{formatJalali(order.createdAt, { style: "numeric" })}</p>
                </div>
                <div className="text-left">
                  <Price amountRial={order.totalRial} className="font-medium" />
                  <p className="text-xs text-muted">{STATUS_LABEL_FA[order.status] ?? order.status}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Whether this specific variety has been purchased (for the stamp grid).
 * A small server-rendered async component keeps the query per-variety
 * simple; at this catalog's size (a handful of varieties) that's a handful
 * of cheap queries, not an N+1 problem worth a join for.
 */
async function VarietyStamp({
  nameFa,
  customerId,
  varietyId,
}: {
  nameFa: string;
  customerId: string;
  varietyId: string;
}) {
  const rows = await db
    .select({ id: orderLines.id })
    .from(orderLines)
    .innerJoin(orders, eq(orderLines.orderId, orders.id))
    .where(and(eq(orderLines.varietyId, varietyId), eq(orders.customerId, customerId), isNotNull(orders.paidAt)))
    .limit(1);
  const tried = rows.length > 0;

  return (
    <div
      className={`rounded-lg border p-4 text-center ${
        tried ? "border-brand bg-brand/5" : "border-dashed border-line opacity-50"
      }`}
    >
      <div className="text-2xl">{tried ? "🌾" : "❔"}</div>
      <div className="mt-1 text-sm font-semibold">{nameFa}</div>
      <div className="mt-1 text-xs text-muted">{tried ? "امتحان شده" : "هنوز امتحان نشده"}</div>
    </div>
  );
}
