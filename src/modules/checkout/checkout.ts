/**
 * Checkout: reserve → order → pay → verify.
 *
 * `placeOrder` is deliberately split across two transactions with the
 * payment-gateway HTTP call sitting between them, never inside either one:
 * a database transaction should never hold row locks open across a network
 * round trip to an external service. Transaction 1 does all the inventory
 * and money work and commits with the order in `pending_payment`;
 * transaction 2 (a single small update) attaches the gateway's authority
 * once we have it. If the gateway call itself fails, the order is left
 * `pending_payment` with no payment row — the reservation still expires on
 * its own via `sweepExpiredReservations`, so nothing leaks.
 *
 * `verifyPayment` is the idempotent half: ZarinPal (and our fake gateway)
 * can and will redeliver the callback, so the whole function must be safe to
 * run twice for the same authority. The payment row's own status is checked
 * under a row lock before any stock or points move, which is what makes a
 * replay a no-op instead of a double-sale.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db, type Transaction } from "../../db/client";
import {
  addresses,
  cartItems,
  customers,
  lots,
  orders,
  orderLines,
  payments,
  skus,
} from "../../db/schema/index";
import { loadEnv } from "../../globals/config";
import { DomainError } from "../../globals/errors";
import { addRial, rial, type Rial } from "../../globals/money";
import { grams, type Grams } from "../../globals/weight";
import { allocatePacksFefo, type AllocatableLot } from "../inventory/allocate";
import {
  consumeReservationsForOrder,
  createReservation,
  releaseReservationsForOrder,
  sweepExpiredReservations,
} from "../inventory/reservations";
import { applyPurchaseRewards, redeemPointsAtCheckout, refundPointsForOrder, type RewardResult } from "../loyalty/apply";
import { applyRedemption } from "../loyalty/points";
import { canHandle, holdsReservation, nextOrderStatus, type OrderStatus } from "../orders/lifecycle";
import { generateOrderNumber } from "../orders/order-number";
import { defaultPaymentProvider } from "../payments";
import { quoteShipping } from "../shipping/rate";
import { zoneForProvince } from "../shipping/zones";

/**
 * Release any hold whose lease has passed, cancelling orders that never paid
 * and refunding any points they'd redeemed. Called at the top of every
 * checkout so an abandoned cart's grams are free again before the next
 * shopper's allocation runs — see reservations.ts for why this is "lazy"
 * rather than cron-driven.
 */
async function expireStaleHolds(tx: Transaction): Promise<void> {
  const affectedOrderIds = await sweepExpiredReservations(tx);
  for (const orderId of affectedOrderIds) {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order) continue;
    if (holdsReservation(order.status as OrderStatus) && canHandle(order.status as OrderStatus, "expire")) {
      await tx
        .update(orders)
        .set({ status: nextOrderStatus(order.status as OrderStatus, "expire") })
        .where(eq(orders.id, orderId));
      await refundPointsForOrder(tx, orderId);
    }
  }
}

export interface PlaceOrderInput {
  cartId: string;
  customerId: string;
  addressId: string;
  /** Requested redemption; silently clamped to what's actually allowed. */
  pointsToRedeem: number;
  siteUrl: string;
}

export interface PlaceOrderResult {
  orderId: string;
  orderNumber: string;
  redirectUrl: string;
}

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const env = loadEnv();

  const created = await db.transaction(async (tx) => {
    await expireStaleHolds(tx);

    const [address] = await tx
      .select()
      .from(addresses)
      .where(and(eq(addresses.id, input.addressId), eq(addresses.customerId, input.customerId)));
    if (!address) {
      throw new DomainError("VALIDATION", "address does not belong to this customer", {
        addressId: input.addressId,
      });
    }

    const items = await tx.select().from(cartItems).where(eq(cartItems.cartId, input.cartId));
    if (items.length === 0) {
      throw new DomainError("VALIDATION", "cart is empty");
    }

    // Lock every candidate lot for every variety in the cart up front, in a
    // single statement — locking one variety's lots at a time in a loop
    // would let two concurrent checkouts across different varieties lock in
    // opposite orders and deadlock each other.
    const varietyIds = [...new Set(items.map((i) => i.varietyId))];
    const lockedLots = await tx
      .select()
      .from(lots)
      .where(and(inArray(lots.varietyId, varietyIds), eq(lots.status, "active")))
      .orderBy(lots.id) // fixed lock order, belt-and-suspenders against deadlock
      .for("update");

    const lotIds = lockedLots.map((l) => l.id);
    const skuRows = lotIds.length
      ? await tx.select().from(skus).where(and(eq(skus.isActive, true), inArray(skus.lotId, lotIds)))
      : [];

    const orderLineRows: {
      varietyId: string;
      lotId: string;
      skuId: string;
      packSizeG: number;
      packs: number;
      unitPriceRial: number;
      lineTotalRial: number;
      lineWeightG: number;
    }[] = [];
    const reservationRows: { lotId: string; quantityG: Grams }[] = [];
    let totalWeightG = 0;
    const lineTotals: Rial[] = [];

    for (const item of items) {
      const varietyLots: AllocatableLot[] = lockedLots
        .filter((l) => l.varietyId === item.varietyId)
        .map((l) => ({
          id: l.id,
          harvestYear: l.harvestYear,
          quantityOnHandG: grams(l.quantityOnHandG),
          quantityReservedG: grams(l.quantityReservedG),
          status: l.status,
        }));

      // Throws OUT_OF_STOCK, which aborts the whole transaction — no partial
      // order is ever created. The customer sees this as "an item in your
      // cart just sold out"; nothing has been charged or reserved yet.
      const allocations = allocatePacksFefo(varietyLots, grams(item.packSizeG), item.quantity);

      for (const allocation of allocations) {
        const sku = skuRows.find((s) => s.lotId === allocation.lotId && s.packSizeG === item.packSizeG);
        if (!sku) {
          throw new DomainError("LOT_UNAVAILABLE", "no active SKU for this pack size on the allocated lot", {
            lotId: allocation.lotId,
            packSizeG: item.packSizeG,
          });
        }
        const lineTotalRial = rial(sku.priceRial * allocation.packs);
        const lineWeightG = item.packSizeG * allocation.packs;
        lineTotals.push(lineTotalRial);
        totalWeightG += lineWeightG;
        orderLineRows.push({
          varietyId: item.varietyId,
          lotId: allocation.lotId,
          skuId: sku.id,
          packSizeG: item.packSizeG,
          packs: allocation.packs,
          unitPriceRial: sku.priceRial,
          lineTotalRial,
          lineWeightG,
        });
        reservationRows.push({ lotId: allocation.lotId, quantityG: grams(lineWeightG) });
      }
    }

    const subtotalRial = addRial(...lineTotals, rial(0));
    const zone = zoneForProvince(address.province);
    const shippingQuote = quoteShipping({
      totalWeightG: grams(totalWeightG),
      zone,
      subtotalRial,
      freeShippingThresholdRial: rial(env.FREE_SHIPPING_THRESHOLD_RIAL),
    });

    const [customer] = await tx
      .select()
      .from(customers)
      .where(eq(customers.id, input.customerId))
      .for("update");
    if (!customer) throw new DomainError("VALIDATION", "customer not found", { customerId: input.customerId });

    const redemption = applyRedemption(subtotalRial, customer.pointsBalanceCache, input.pointsToRedeem);
    const totalRial = addRial(redemption.totalAfterDiscountRial, shippingQuote.feeRial);

    const orderNumber = generateOrderNumber();
    const [order] = await tx
      .insert(orders)
      .values({
        orderNumber,
        customerId: input.customerId,
        addressId: address.id,
        shipRecipientName: address.recipientName,
        shipRecipientMobile: address.recipientMobile,
        shipProvince: address.province,
        shipCity: address.city,
        shipLine1: address.line1,
        shipPostalCode: address.postalCode,
        status: "pending_payment",
        subtotalRial,
        shippingFeeRial: shippingQuote.feeRial,
        discountRial: redemption.discountRial,
        totalRial,
        totalWeightG,
        pointsRedeemed: redemption.pointsRedeemed,
      })
      .returning();
    if (!order) throw new Error("failed to create order");

    for (const line of orderLineRows) {
      await tx.insert(orderLines).values({ ...line, orderId: order.id });
    }

    // Idempotency keys are per (order, lot, pack size): the same lot can
    // legitimately be allocated to two different cart lines (two pack sizes
    // cut from one lot), and those must not collide on one reservation key.
    for (const [index, reservation] of reservationRows.entries()) {
      await createReservation(tx, {
        lotId: reservation.lotId,
        quantityG: reservation.quantityG,
        orderId: order.id,
        idempotencyKey: `reserve:${order.id}:${reservation.lotId}:${index}`,
      });
    }

    if (redemption.pointsRedeemed > 0) {
      await redeemPointsAtCheckout(tx, {
        customerId: customer.id,
        orderId: order.id,
        points: redemption.pointsRedeemed,
      });
    }

    await tx.delete(cartItems).where(eq(cartItems.cartId, input.cartId));

    return { orderId: order.id, orderNumber, totalRial };
  });

  // Outside the transaction: the payment gateway's own HTTP call.
  const provider = defaultPaymentProvider(input.siteUrl);
  let paymentRequest;
  try {
    paymentRequest = await provider.requestPayment({
      amountRial: created.totalRial,
      description: `سفارش آیرایس ${created.orderNumber}`,
      callbackUrl: `${input.siteUrl}/pay/callback`,
    });
  } catch (error) {
    // The order stands in pending_payment with its hold intact; the customer
    // can retry from the order page, and the hold expires on its own if they
    // never do. Nothing to unwind here.
    throw new DomainError("PAYMENT_FAILED", "could not start a payment with the gateway", {
      orderId: created.orderId,
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  await db.insert(payments).values({
    orderId: created.orderId,
    provider: provider.name,
    authority: paymentRequest.authority,
    status: "pending",
    amountRial: created.totalRial,
  });

  return { orderId: created.orderId, orderNumber: created.orderNumber, redirectUrl: paymentRequest.redirectUrl };
}

export interface VerifyPaymentResult {
  orderId: string;
  orderNumber: string;
  success: boolean;
  /** Present only the first time a payment resolves to success. */
  reward?: RewardResult;
}

export async function verifyPayment(authority: string, siteUrl: string): Promise<VerifyPaymentResult> {
  const [payment] = await db.select().from(payments).where(eq(payments.authority, authority));
  if (!payment) throw new DomainError("NOT_FOUND", "no payment with this authority", { authority });

  // Cheap idempotent replay: already resolved, nothing to call the gateway
  // about again.
  if (payment.status !== "pending") {
    const [order] = await db.select().from(orders).where(eq(orders.id, payment.orderId));
    return { orderId: payment.orderId, orderNumber: order?.orderNumber ?? "", success: payment.status === "paid" };
  }

  const provider = defaultPaymentProvider(siteUrl);
  const verifyResult = await provider.verifyPayment(authority, rial(payment.amountRial));

  return db.transaction(async (tx) => {
    const [freshPayment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, payment.id))
      .for("update");
    if (!freshPayment) throw new Error("payment disappeared mid-verification");

    // A concurrent delivery of the same callback already resolved it.
    if (freshPayment.status !== "pending") {
      const [order] = await tx.select().from(orders).where(eq(orders.id, freshPayment.orderId));
      return {
        orderId: freshPayment.orderId,
        orderNumber: order?.orderNumber ?? "",
        success: freshPayment.status === "paid",
      };
    }

    const [order] = await tx.select().from(orders).where(eq(orders.id, freshPayment.orderId)).for("update");
    if (!order) throw new Error("order missing for a pending payment");

    if (verifyResult.success) {
      await tx
        .update(payments)
        .set({ status: "paid", refId: verifyResult.refId, verifiedAt: new Date() })
        .where(eq(payments.id, freshPayment.id));
      await consumeReservationsForOrder(tx, order.id, `payment:${authority}`);
      await tx
        .update(orders)
        .set({ status: nextOrderStatus(order.status as OrderStatus, "pay_success"), paidAt: new Date() })
        .where(eq(orders.id, order.id));
      const reward = await applyPurchaseRewards(tx, order.id);
      return { orderId: order.id, orderNumber: order.orderNumber, success: true, reward };
    }

    await tx
      .update(payments)
      .set({ status: "failed", failureReason: verifyResult.failureReason })
      .where(eq(payments.id, freshPayment.id));
    await tx
      .update(orders)
      .set({ status: nextOrderStatus(order.status as OrderStatus, "pay_fail") })
      .where(eq(orders.id, order.id));
    return { orderId: order.id, orderNumber: order.orderNumber, success: false };
  });
}

/** Retry a failed payment on the same order — a fresh gateway attempt, same hold. */
export async function retryPayment(orderId: string, siteUrl: string): Promise<{ redirectUrl: string }> {
  const order = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!row) throw new DomainError("NOT_FOUND", "order not found", { orderId });
    if (!canHandle(row.status as OrderStatus, "retry_payment")) {
      throw new DomainError("CONFLICT", "this order cannot be retried", { status: row.status });
    }
    await tx
      .update(orders)
      .set({ status: nextOrderStatus(row.status as OrderStatus, "retry_payment") })
      .where(eq(orders.id, orderId));
    return row;
  });

  const provider = defaultPaymentProvider(siteUrl);
  const paymentRequest = await provider.requestPayment({
    amountRial: rial(order.totalRial),
    description: `سفارش آیرایس ${order.orderNumber} (تلاش دوباره)`,
    callbackUrl: `${siteUrl}/pay/callback`,
  });
  await db.insert(payments).values({
    orderId,
    provider: provider.name,
    authority: paymentRequest.authority,
    status: "pending",
    amountRial: order.totalRial,
  });
  return { redirectUrl: paymentRequest.redirectUrl };
}

/** Explicit cancellation, e.g. from an order-detail "cancel" action. */
export async function cancelOrder(orderId: string, customerId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.customerId, customerId)))
      .for("update");
    if (!order) throw new DomainError("NOT_FOUND", "order not found", { orderId });
    if (!canHandle(order.status as OrderStatus, "expire")) {
      throw new DomainError("CONFLICT", "this order can no longer be cancelled", { status: order.status });
    }
    await tx
      .update(orders)
      .set({ status: nextOrderStatus(order.status as OrderStatus, "expire") })
      .where(eq(orders.id, orderId));
    await releaseReservationsForOrder(tx, orderId);
    await refundPointsForOrder(tx, orderId);
  });
}

export type { OrderStatus };
