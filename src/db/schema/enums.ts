import { pgEnum } from "drizzle-orm/pg-core";

/** Grain shape. Drives cooking guidance and the comparison table. */
export const grainTypeEnum = pgEnum("grain_type", ["long", "medium", "short"]);

/**
 * Commercial grade as the Iranian market uses it. `daneh_shekasteh` (broken
 * grain) is sold as its own product, not as a defect, so it is a grade.
 */
export const lotGradeEnum = pgEnum("lot_grade", [
  "momtaz", // ممتاز
  "darajeh_yek", // درجه یک
  "darajeh_do", // درجه دو
  "daneh_shekasteh", // دانه شکسته
]);

/**
 * Lot lifecycle. `quarantined` exists for the recall path: a lot can be pulled
 * from sale without deleting it, because orders reference it forever.
 */
export const lotStatusEnum = pgEnum("lot_status", [
  "incoming",
  "active",
  "depleted",
  "quarantined",
  "archived",
]);

/** Milling/cropping cycle — کشت اول is the premium first crop. */
export const cropCycleEnum = pgEnum("crop_cycle", ["first", "ratoon"]);

/** Documents attached to a lot; the evidence behind the provenance claim. */
export const certificateKindEnum = pgEnum("certificate_kind", [
  "lab_analysis", // آزمون آزمایشگاهی
  "origin", // گواهی خاستگاه
  "organic",
  "health", // گواهی بهداشت
]);

/**
 * Why grams moved *on hand*. Every row in the ledger has one; there is no
 * "adjustment" catch-all, because an unexplained movement is a reconciliation
 * failure.
 *
 * Deliberately does NOT include reservation/release: those never change
 * `on_hand`, only the separate reserved counter, and are tracked in
 * `stock_reservations` instead (see commerce.ts). Mixing both into one column
 * that is documented as "sums to on_hand" would double-count a hold. `sale` is
 * the one on_hand movement checkout produces, and it fires once, when a
 * reservation is consumed by a verified payment — never at reservation time.
 */
export const stockMovementReasonEnum = pgEnum("stock_movement_reason", [
  "intake", // received from the mill
  "sale", // a reservation consumed by a verified payment
  "return", // customer return under the 10-day guarantee
  "shrinkage", // counted loss, requires a note
  "recount", // physical stocktake correction, requires a note
]);

/** A hold's lifecycle: active while a cart or pending order needs the grams. */
export const reservationStatusEnum = pgEnum("reservation_status", [
  "active",
  "released", // expired, or the cart/order was abandoned/cancelled
  "consumed", // payment verified; became a `sale` stock_movement
]);

export const orderStatusEnum = pgEnum("order_status", [
  "pending_payment",
  "paid",
  "payment_failed",
  "fulfilled",
  "cancelled",
  "returned",
]);

export const paymentStatusEnum = pgEnum("payment_status", ["pending", "paid", "failed"]);

export const paymentProviderEnum = pgEnum("payment_provider", ["zarinpal", "fake"]);

/**
 * Ledger reasons for the points balance — same append-only pattern as stock.
 *
 * `redeem_checkout` fires the moment an order is placed (points are "spent"
 * up front, the same way stock is reserved up front); `refund_checkout`
 * reverses it if that order's hold later expires or is cancelled without
 * paying. `earn_purchase` only fires once a payment actually verifies.
 */
export const loyaltyLedgerReasonEnum = pgEnum("loyalty_ledger_reason", [
  "earn_purchase",
  "redeem_checkout",
  "refund_checkout",
  "expire",
  "adjustment", // manual, always requires a note — see the check constraint
]);
