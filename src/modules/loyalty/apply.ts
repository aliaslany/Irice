/**
 * Applying rewards — the DB-backed half of the loyalty modules. Everything
 * upstream (points.ts, tier.ts, streak.ts, badges.ts) is pure math; this file
 * is the only place that reads order history and writes the ledger, the
 * customer cache, and customer_badges.
 */
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Transaction } from "../../db/client";
import {
  customerBadges,
  customers,
  lots,
  loyaltyLedger,
  orderLines,
  orders,
  varieties,
  type Customer,
} from "../../db/schema/index";
import { toJalali } from "../../globals/date";
import { rial } from "../../globals/money";
import { GRAMS_PER_KG } from "../../globals/weight";
import { badgeDefinition, evaluateBadges, type BadgeDefinition } from "./badges";
import { pointsForOrder } from "./points";
import { computeStreak } from "./streak";
import { computeTier } from "./tier";

/** Postgres unique_violation — see the Postgres errcodes appendix. */
const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === UNIQUE_VIOLATION
  );
}

function incrPointsBalance(points: number) {
  return sql`${customers.pointsBalanceCache} + ${points}`;
}
function decrPointsBalance(points: number) {
  return sql`${customers.pointsBalanceCache} - ${points}`;
}

/**
 * Reserve points at checkout time — see the loyalty_ledger_reason comment in
 * the schema for why redemption happens up front rather than at payment
 * verification. Caller must already have validated the amount against
 * maxRedeemablePoints using a value read under this same transaction.
 */
export async function redeemPointsAtCheckout(
  tx: Transaction,
  params: { customerId: string; orderId: string; points: number },
): Promise<void> {
  if (params.points <= 0) return;
  await tx.insert(loyaltyLedger).values({
    customerId: params.customerId,
    deltaPoints: -params.points,
    reason: "redeem_checkout",
    orderId: params.orderId,
    idempotencyKey: `redeem:${params.orderId}`,
  });
  await tx
    .update(customers)
    .set({ pointsBalanceCache: decrPointsBalance(params.points) })
    .where(eq(customers.id, params.customerId));
}

/** Give back a checkout's redeemed points if its order never converted to paid. */
export async function refundPointsForOrder(tx: Transaction, orderId: string): Promise<void> {
  const [entry] = await tx
    .select()
    .from(loyaltyLedger)
    .where(and(eq(loyaltyLedger.orderId, orderId), eq(loyaltyLedger.reason, "redeem_checkout")));
  if (!entry) return;

  const refund = -entry.deltaPoints; // deltaPoints was negative at redemption
  try {
    await tx.insert(loyaltyLedger).values({
      customerId: entry.customerId,
      deltaPoints: refund,
      reason: "refund_checkout",
      orderId,
      idempotencyKey: `refund:${orderId}`,
    });
  } catch (error) {
    if (isUniqueViolation(error)) return; // already refunded — idempotent
    throw error;
  }
  await tx
    .update(customers)
    .set({ pointsBalanceCache: incrPointsBalance(refund) })
    .where(eq(customers.id, entry.customerId));
}

export interface RewardResult {
  pointsEarned: number;
  /** Empty on a retried/idempotent call — nothing new to celebrate. */
  newBadges: BadgeDefinition[];
  tier: ReturnType<typeof computeTier>;
  streakMonths: number;
}

/**
 * Runs once an order verifies as paid: earns points, then recomputes the
 * customer's whole gamification state from their real paid-order history
 * (not incrementally) and unlocks any newly-qualifying badges.
 *
 * Idempotent: a retried payment callback (the whole reason payments.authority
 * verification must tolerate replay) calls this again safely — the earn
 * ledger entry's idempotency key absorbs the duplicate, and badge inserts are
 * a diff against what's already unlocked, so nothing is double-counted.
 */
export async function applyPurchaseRewards(tx: Transaction, orderId: string): Promise<RewardResult> {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
  if (!order) throw new Error(`applyPurchaseRewards: order ${orderId} not found`);

  const pointsEarned = pointsForOrder(rial(order.subtotalRial));
  const earnInsert = await tx
    .insert(loyaltyLedger)
    .values({
      customerId: order.customerId,
      deltaPoints: pointsEarned,
      reason: "earn_purchase",
      orderId,
      idempotencyKey: `earn:${orderId}`,
    })
    .onConflictDoNothing({ target: loyaltyLedger.idempotencyKey })
    .returning({ id: loyaltyLedger.id });

  const isFirstApplication = earnInsert.length > 0;
  if (isFirstApplication && pointsEarned > 0) {
    await tx
      .update(customers)
      .set({ pointsBalanceCache: incrPointsBalance(pointsEarned) })
      .where(eq(customers.id, order.customerId));
  }
  await tx.update(orders).set({ pointsEarned }).where(eq(orders.id, orderId));

  // Recompute the full picture from real history — cheap at this catalog's
  // order volume, and it means the cache can never drift from the truth.
  const paidOrders = await tx
    .select({ id: orders.id, paidAt: orders.paidAt })
    .from(orders)
    .where(and(eq(orders.customerId, order.customerId), isNotNull(orders.paidAt)));

  const paidOrderIds = paidOrders.map((o) => o.id);
  const lines =
    paidOrderIds.length > 0
      ? await tx
          .select({
            packSizeG: orderLines.packSizeG,
            lineWeightG: orderLines.lineWeightG,
            varietySlug: varieties.slug,
            originProvince: lots.originProvince,
          })
          .from(orderLines)
          .innerJoin(varieties, eq(orderLines.varietyId, varieties.id))
          .innerJoin(lots, eq(orderLines.lotId, lots.id))
          .where(inArray(orderLines.orderId, paidOrderIds))
      : [];

  const [publishedRow] = await tx
    .select({ publishedCount: sql<string>`count(*)` })
    .from(varieties)
    .where(eq(varieties.isPublished, true));

  const totalWeightG = lines.reduce((sum, l) => sum + l.lineWeightG, 0);
  const totalKg = totalWeightG / GRAMS_PER_KG;
  const distinctVarietySlugs = new Set(lines.map((l) => l.varietySlug));
  const distinctOriginProvinces = new Set(lines.map((l) => l.originProvince));
  const hasBigBag = lines.some((l) => l.packSizeG === 20_000);

  const jalaliPaidDates = paidOrders
    .filter((o): o is typeof o & { paidAt: Date } => o.paidAt !== null)
    .map((o) => toJalali(o.paidAt));
  const streak = computeStreak(jalaliPaidDates, toJalali(new Date()));
  const tier = computeTier(totalKg);

  await tx
    .update(customers)
    .set({
      totalKgPurchasedCache: Math.round(totalKg),
      currentStreakMonths: streak.currentMonths,
      longestStreakMonths: streak.longestMonths,
      updatedAt: new Date(),
    })
    .where(eq(customers.id, order.customerId));

  const earnedCodes = evaluateBadges({
    totalPaidOrders: paidOrders.length,
    totalKg,
    distinctVarietySlugs,
    publishedVarietyCount: Number(publishedRow?.publishedCount ?? 0),
    distinctOriginProvinces,
    hasBigBag,
    currentStreakMonths: streak.currentMonths,
  });

  const alreadyUnlocked = await tx
    .select({ badgeCode: customerBadges.badgeCode })
    .from(customerBadges)
    .where(eq(customerBadges.customerId, order.customerId));
  const alreadyUnlockedCodes = new Set(alreadyUnlocked.map((b) => b.badgeCode));

  const newCodes = [...earnedCodes].filter((code) => !alreadyUnlockedCodes.has(code));
  const newBadges: BadgeDefinition[] = [];
  for (const code of newCodes) {
    await tx
      .insert(customerBadges)
      .values({ customerId: order.customerId, badgeCode: code, sourceOrderId: orderId })
      .onConflictDoNothing();
    const def = badgeDefinition(code);
    if (def) newBadges.push(def);
  }

  return {
    pointsEarned: isFirstApplication ? pointsEarned : 0,
    newBadges: isFirstApplication ? newBadges : [],
    tier,
    streakMonths: streak.currentMonths,
  };
}

export async function getCustomerGamificationSummary(
  tx: Transaction,
  customerId: string,
): Promise<{ customer: Customer | undefined; badges: (typeof customerBadges.$inferSelect)[] }> {
  const [customer] = await tx.select().from(customers).where(eq(customers.id, customerId));
  const badgeRows = await tx
    .select()
    .from(customerBadges)
    .where(eq(customerBadges.customerId, customerId));
  return { customer, badges: badgeRows };
}
