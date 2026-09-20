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
 * Why grams moved. Every row in the ledger has one; there is no "adjustment"
 * catch-all, because an unexplained movement is a reconciliation failure.
 */
export const stockMovementReasonEnum = pgEnum("stock_movement_reason", [
  "intake", // received from the mill
  "reservation", // held for a pending cart/order
  "release", // reservation expired or cart abandoned
  "sale", // reservation converted on payment
  "return", // customer return under the 10-day guarantee
  "shrinkage", // counted loss, requires a note
  "recount", // physical stocktake correction, requires a note
]);
