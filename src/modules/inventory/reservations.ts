/**
 * Stock reservation lifecycle — the DB-backed half of stock_reservations
 * (see the schema comment for the state machine: active -> consumed/released).
 *
 * Every function here expects to run inside the caller's transaction; none
 * of them commit on their own, because a reservation is only ever meaningful
 * alongside the order or lot-row lock it belongs to.
 */
import { and, eq, lt, sql } from "drizzle-orm";
import type { Transaction } from "../../db/client";
import { lots, stockMovements, stockReservations } from "../../db/schema/index";
import type { Grams } from "../../globals/weight";

export const RESERVATION_HOLD_MINUTES = 20;

export function reservationExpiresAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + RESERVATION_HOLD_MINUTES * 60 * 1000);
}

function incrReserved(deltaG: Grams) {
  return sql`${lots.quantityReservedG} + ${deltaG}`;
}
function decrReserved(deltaG: Grams) {
  return sql`${lots.quantityReservedG} - ${deltaG}`;
}

/**
 * Take a hold: increments the lot's reserved counter and records the hold.
 * Caller must already hold a row lock on the lot (checkout does this via
 * `FOR UPDATE` when it reads sellable lots for allocation).
 */
export async function createReservation(
  tx: Transaction,
  params: { lotId: string; quantityG: Grams; orderId: string; idempotencyKey: string; now?: Date },
): Promise<void> {
  await tx.insert(stockReservations).values({
    lotId: params.lotId,
    quantityG: params.quantityG,
    orderId: params.orderId,
    expiresAt: reservationExpiresAt(params.now),
    idempotencyKey: params.idempotencyKey,
  });
  await tx
    .update(lots)
    .set({ quantityReservedG: incrReserved(params.quantityG) })
    .where(eq(lots.id, params.lotId));
}

/**
 * Convert a hold into a permanent stock decrease: the moment a reservation
 * becomes a `sale` stock_movement, per the schema's comment on
 * stock_movements. Idempotent — replaying it against an already-consumed
 * reservation is a no-op, which is what makes a retried payment callback
 * safe to run this again.
 */
export async function consumeReservation(
  tx: Transaction,
  reservationId: string,
  createdBy: string,
): Promise<void> {
  const [reservation] = await tx
    .select()
    .from(stockReservations)
    .where(eq(stockReservations.id, reservationId))
    .for("update");
  if (!reservation || reservation.status !== "active") return; // already resolved; idempotent no-op

  await tx
    .update(stockReservations)
    .set({ status: "consumed", resolvedAt: new Date() })
    .where(eq(stockReservations.id, reservationId));
  await tx
    .update(lots)
    .set({
      quantityReservedG: decrReserved(reservation.quantityG as Grams),
      quantityOnHandG: sql`${lots.quantityOnHandG} - ${reservation.quantityG}`,
    })
    .where(eq(lots.id, reservation.lotId));
  await tx.insert(stockMovements).values({
    lotId: reservation.lotId,
    deltaG: -reservation.quantityG,
    reason: "sale",
    orderId: reservation.orderId,
    idempotencyKey: `sale:${reservation.id}`,
    createdBy,
  });
}

/** Give the grams back without a sale — expired hold or a cancelled order. */
export async function releaseReservation(tx: Transaction, reservationId: string): Promise<void> {
  const [reservation] = await tx
    .select()
    .from(stockReservations)
    .where(eq(stockReservations.id, reservationId))
    .for("update");
  if (!reservation || reservation.status !== "active") return;

  await tx
    .update(stockReservations)
    .set({ status: "released", resolvedAt: new Date() })
    .where(eq(stockReservations.id, reservationId));
  await tx
    .update(lots)
    .set({ quantityReservedG: decrReserved(reservation.quantityG as Grams) })
    .where(eq(lots.id, reservation.lotId));
}

export async function releaseReservationsForOrder(tx: Transaction, orderId: string): Promise<void> {
  const active = await tx
    .select({ id: stockReservations.id })
    .from(stockReservations)
    .where(and(eq(stockReservations.orderId, orderId), eq(stockReservations.status, "active")));
  for (const row of active) {
    await releaseReservation(tx, row.id);
  }
}

export async function consumeReservationsForOrder(
  tx: Transaction,
  orderId: string,
  createdBy: string,
): Promise<void> {
  const active = await tx
    .select({ id: stockReservations.id })
    .from(stockReservations)
    .where(and(eq(stockReservations.orderId, orderId), eq(stockReservations.status, "active")));
  for (const row of active) {
    await consumeReservation(tx, row.id, createdBy);
  }
}

/**
 * Sweep every reservation past its expiry back to `released`, returning the
 * order ids that held them so the caller can cancel any that never paid.
 * Called lazily at the start of checkout allocation — see
 * docs/ARCHITECTURE.md's note on lazy expiry — so an abandoned hold's grams
 * are free again before the next shopper's allocation runs, with no cron
 * required for correctness (though a scheduled call to this is still worth
 * having so an idle catalog doesn't sit with phantom reserved grams
 * indefinitely).
 */
export async function sweepExpiredReservations(tx: Transaction, now: Date = new Date()): Promise<string[]> {
  const expired = await tx
    .select({ id: stockReservations.id, orderId: stockReservations.orderId })
    .from(stockReservations)
    .where(and(eq(stockReservations.status, "active"), lt(stockReservations.expiresAt, now)));

  const affectedOrderIds = new Set<string>();
  for (const row of expired) {
    await releaseReservation(tx, row.id);
    if (row.orderId) affectedOrderIds.add(row.orderId);
  }
  return [...affectedOrderIds];
}
