import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { lots } from "./catalog.js";
import { stockMovementReasonEnum } from "./enums.js";

/**
 * Append-only stock ledger, in grams.
 *
 * `lots.quantity_on_hand_g` is a cache of `sum(delta_g)` for the lot; this
 * table is the truth. Rows are never updated or deleted — a mistake is
 * corrected by a compensating row with reason `recount` and a note, so the
 * history of a recalled batch stays intact.
 *
 * `idempotency_key` is what makes a retried payment callback or a double-
 * submitted admin form safe: the second write hits the unique index and is
 * discarded rather than moving stock twice.
 */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => lots.id, { onDelete: "restrict" }),
    /** Signed, in grams: positive is intake/return, negative is sale/shrinkage. */
    deltaG: bigint("delta_g", { mode: "number" }).notNull(),
    reason: stockMovementReasonEnum("reason").notNull(),
    /** Set for reservation/sale/release rows; null for intake and stocktakes. */
    orderId: uuid("order_id"),
    /** Deduplication key for retried writes. */
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull().unique(),
    note: text("note"),
    createdBy: varchar("created_by", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("stock_movements_lot_time_idx").on(table.lotId, table.createdAt),
    index("stock_movements_order_idx").on(table.orderId),
    check("stock_movements_delta_non_zero", sql`${table.deltaG} <> 0`),
    // Shrinkage and recount move stock without a customer-visible cause, so
    // they must carry a written explanation.
    check(
      "stock_movements_explained",
      sql`(${table.reason} not in ('shrinkage', 'recount')) or (${table.note} is not null)`,
    ),
  ],
);

export type StockMovement = typeof stockMovements.$inferSelect;
export type NewStockMovement = typeof stockMovements.$inferInsert;
