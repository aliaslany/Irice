/**
 * The 10-day return guarantee — the DB-backed half.
 *
 * Approving a return does three things atomically: restocks every order
 * line's lot (a `return` stock_movement, the one on-hand-increasing reason
 * the ledger has), reverses the points earned on that order (a
 * `return_reversal` ledger entry — the customer keeps the rice they already
 * received back's worth of trust, not the loyalty reward for keeping it),
 * and marks the order `returned`. Rejecting changes nothing but the
 * request's own status.
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, type Transaction } from "../../db/client";
import {
  customers,
  loyaltyLedger,
  orderLines,
  orders,
  returnRequests,
  stockMovements,
  lots,
  type ReturnRequest,
} from "../../db/schema/index";
import { DomainError } from "../../globals/errors";
import { nextOrderStatus } from "../orders/lifecycle";
import { checkReturnEligibility } from "./eligibility";

function sqlIncr(deltaG: number) {
  return sql`${lots.quantityOnHandG} + ${deltaG}`;
}
function sqlDecrPoints(points: number) {
  return sql`${customers.pointsBalanceCache} - ${points}`;
}

async function hasOpenReturnRequest(tx: Transaction, orderId: string): Promise<boolean> {
  const [existing] = await tx
    .select({ id: returnRequests.id })
    .from(returnRequests)
    .where(and(eq(returnRequests.orderId, orderId), isNull(returnRequests.resolvedAt)));
  return existing !== undefined;
}

export async function requestReturn(params: {
  orderId: string;
  customerId: string;
  reason: string;
}): Promise<ReturnRequest> {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, params.orderId), eq(orders.customerId, params.customerId)))
      .for("update");
    if (!order) throw new DomainError("NOT_FOUND", "order not found", { orderId: params.orderId });

    const hasOpen = await hasOpenReturnRequest(tx, order.id);
    const eligibility = checkReturnEligibility(order, hasOpen);
    if (!eligibility.eligible) {
      throw new DomainError("CONFLICT", eligibility.reasonFa ?? "این سفارش واجد شرایط مرجوعی نیست.", {
        orderId: order.id,
      });
    }

    if (params.reason.trim().length === 0) {
      throw new DomainError("VALIDATION", "reason is required");
    }

    const [created] = await tx
      .insert(returnRequests)
      .values({ orderId: order.id, customerId: params.customerId, reason: params.reason.trim() })
      .returning();
    if (!created) throw new Error("failed to create return request");
    return created;
  });
}

/** Restock, reverse points, and close the loop — the only path that actually moves anything. */
export async function approveReturn(returnRequestId: string, resolutionNote?: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(returnRequests)
      .where(eq(returnRequests.id, returnRequestId))
      .for("update");
    if (!request) throw new DomainError("NOT_FOUND", "return request not found", { returnRequestId });
    if (request.status !== "requested") {
      throw new DomainError("CONFLICT", "this request was already resolved", { status: request.status });
    }

    const [order] = await tx.select().from(orders).where(eq(orders.id, request.orderId)).for("update");
    if (!order) throw new Error(`order ${request.orderId} missing for return request ${returnRequestId}`);

    const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, order.id));
    for (const line of lines) {
      await tx
        .update(lots)
        .set({ quantityOnHandG: sqlIncr(line.lineWeightG) })
        .where(eq(lots.id, line.lotId));
      await tx.insert(stockMovements).values({
        lotId: line.lotId,
        deltaG: line.lineWeightG,
        reason: "return",
        orderId: order.id,
        idempotencyKey: `return:${returnRequestId}:${line.id}`,
        createdBy: "admin",
      });
    }

    if (order.pointsEarned > 0) {
      await tx.insert(loyaltyLedger).values({
        customerId: order.customerId,
        deltaPoints: -order.pointsEarned,
        reason: "return_reversal",
        orderId: order.id,
        idempotencyKey: `return-reversal:${returnRequestId}`,
      });
      await tx
        .update(customers)
        .set({ pointsBalanceCache: sqlDecrPoints(order.pointsEarned) })
        .where(eq(customers.id, order.customerId));
    }

    const returnedStatus = nextOrderStatus(order.status as never, "return");
    await tx.update(orders).set({ status: returnedStatus }).where(eq(orders.id, order.id));
    await tx
      .update(returnRequests)
      .set({
        status: "completed",
        refundRial: order.totalRial,
        resolutionNote: resolutionNote ?? null,
        resolvedAt: new Date(),
      })
      .where(eq(returnRequests.id, returnRequestId));
  });
}

export async function rejectReturn(returnRequestId: string, resolutionNote: string): Promise<void> {
  if (resolutionNote.trim().length === 0) {
    throw new DomainError("VALIDATION", "a rejection needs a note for the customer");
  }
  await db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(returnRequests)
      .where(eq(returnRequests.id, returnRequestId))
      .for("update");
    if (!request) throw new DomainError("NOT_FOUND", "return request not found", { returnRequestId });
    if (request.status !== "requested") {
      throw new DomainError("CONFLICT", "this request was already resolved", { status: request.status });
    }
    await tx
      .update(returnRequests)
      .set({ status: "rejected", resolutionNote: resolutionNote.trim(), resolvedAt: new Date() })
      .where(eq(returnRequests.id, returnRequestId));
  });
}

/** The most recent return request against this order, whatever its status — for the order page. */
export async function getReturnRequestForOrder(orderId: string): Promise<ReturnRequest | null> {
  const [request] = await db
    .select()
    .from(returnRequests)
    .where(eq(returnRequests.orderId, orderId))
    .orderBy(desc(returnRequests.requestedAt))
    .limit(1);
  return request ?? null;
}

export async function listOpenReturnRequests() {
  return db
    .select({ request: returnRequests, order: orders })
    .from(returnRequests)
    .innerJoin(orders, eq(returnRequests.orderId, orders.id))
    .where(eq(returnRequests.status, "requested"))
    .orderBy(returnRequests.requestedAt);
}
