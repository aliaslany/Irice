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
import { lots } from "./catalog";
import { orders } from "./commerce";
import { reservationStatusEnum, stockMovementReasonEnum } from "./enums";

/**
 * Append-only ledger for ON-HAND stock, in grams. Reservations and their
 * release do NOT appear here — see {@link stockReservations} — because they
 * never change on_hand, only the separate reserved counter, and this column
 * is documented (and relied on) as summing exactly to on_hand.
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
    /** Set for `sale`; null for intake, return, shrinkage and recount. */
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "restrict" }),
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

/**
 * A hold on grams of a specific lot, taken at checkout so two shoppers can
 * never both "buy" the last bag. `lots.quantity_reserved_g` is a cache of
 * `sum(quantity_g)` over rows here with status `active`; this table is the
 * truth, same relationship as stock_movements has to on_hand.
 *
 * Lifecycle: `active` → `consumed` (payment verified — this is the moment a
 * `sale` stock_movement is written) or `active` → `released` (the reservation
 * expired, or the order/cart was abandoned). A row is never deleted, so a
 * lot's full history of holds — including the ones that never converted —
 * stays inspectable.
 */
export const stockReservations = pgTable(
  "stock_reservations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => lots.id, { onDelete: "restrict" }),
    quantityG: bigint("quantity_g", { mode: "number" }).notNull(),
    status: reservationStatusEnum("status").notNull().default("active"),
    /**
     * The order this hold belongs to. Reservations are created at checkout,
     * alongside the order, not earlier — adding to a cart never touches
     * inventory, only placing an order does. Nullable rather than NOT NULL so
     * a future cart-level pre-reservation feature can reuse this column
     * without a migration; nothing today creates one with this unset.
     */
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "restrict" }),
    /** Reservations past this instant are swept back to `released` on next touch. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("stock_reservations_lot_status_idx").on(table.lotId, table.status),
    index("stock_reservations_order_idx").on(table.orderId),
    // The expiry sweep's whole query plan: active reservations past their time.
    index("stock_reservations_active_expiry_idx").on(table.status, table.expiresAt),
    check("stock_reservations_quantity_positive", sql`${table.quantityG} > 0`),
  ],
);

export type StockReservation = typeof stockReservations.$inferSelect;
export type NewStockReservation = typeof stockReservations.$inferInsert;
