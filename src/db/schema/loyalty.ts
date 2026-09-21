import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { orders } from "./commerce";
import { customers } from "./identity";
import { loyaltyLedgerReasonEnum } from "./enums";

/**
 * Append-only points ledger — the exact shape of `stock_movements`, applied
 * to loyalty points instead of grams. `customers.points_balance_cache` is a
 * cache of `sum(delta_points)`; this table is the truth, so a disputed balance
 * is always answerable by replaying rows rather than trusting a counter.
 */
export const loyaltyLedger = pgTable(
  "loyalty_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    /** Signed: positive for earn, negative for redeem/expire. */
    deltaPoints: bigint("delta_points", { mode: "number" }).notNull(),
    reason: loyaltyLedgerReasonEnum("reason").notNull(),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "restrict" }),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull().unique(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("loyalty_ledger_customer_idx").on(table.customerId, table.createdAt),
    check("loyalty_ledger_delta_non_zero", sql`${table.deltaPoints} <> 0`),
    check(
      "loyalty_ledger_adjustment_explained",
      sql`(${table.reason} <> 'adjustment') or (${table.note} is not null)`,
    ),
  ],
);

/**
 * Unlocked badges — the stamps in the customer's Rice Passport.
 *
 * `badgeCode` is NOT a DB enum on purpose: the badge catalog
 * (modules/loyalty/badges.ts) is content an operator should be able to grow
 * — a new origin-province badge, a seasonal badge — without a migration.
 * The application layer is the source of truth for which codes are valid;
 * this table only records that a customer earned one, and when.
 */
export const customerBadges = pgTable(
  "customer_badges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    badgeCode: varchar("badge_code", { length: 64 }).notNull(),
    /** The order whose payment unlocked this badge, for "why did I get this". */
    sourceOrderId: uuid("source_order_id").references(() => orders.id, { onDelete: "set null" }),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("customer_badges_customer_badge_unique").on(table.customerId, table.badgeCode),
    index("customer_badges_customer_idx").on(table.customerId),
  ],
);

export type LoyaltyLedgerEntry = typeof loyaltyLedger.$inferSelect;
export type NewLoyaltyLedgerEntry = typeof loyaltyLedger.$inferInsert;
export type CustomerBadge = typeof customerBadges.$inferSelect;
export type NewCustomerBadge = typeof customerBadges.$inferInsert;
