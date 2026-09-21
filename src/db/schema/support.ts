import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { orders } from "./commerce";
import { customers } from "./identity";
import { returnStatusEnum } from "./enums";
import { varieties } from "./catalog";

/**
 * The 10-day return guarantee.
 *
 * One row per request, covering the whole order (a partial-line return is a
 * real thing real shops handle, but nothing in this catalog's economics
 * currently justifies the complexity — a request is all-or-nothing, and
 * `note` is where an operator records a partial resolution if one happens).
 *
 * There is no automatic approval path: `approved`/`rejected` are always a
 * human decision, because a bag of rice can't be resold once opened and
 * whether the customer actually opened it isn't something the database can
 * know. `completed` is the terminal state that actually reverses stock and
 * points — see modules/returns/returns.ts.
 */
export const returnRequests = pgTable(
  "return_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    status: returnStatusEnum("status").notNull().default("requested"),
    /** Snapshot at completion — may end up less than the order total for a partial resolution. */
    refundRial: bigint("refund_rial", { mode: "number" }),
    /** Operator's note: why rejected, or how a partial resolution was reached. */
    resolutionNote: text("resolution_note"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    // One open request per order at a time — see the app-level check before
    // insert; this index is what makes that check's read cheap.
    index("return_requests_order_idx").on(table.orderId),
    index("return_requests_customer_idx").on(table.customerId, table.requestedAt),
    check("return_requests_refund_non_negative", sql`${table.refundRial} is null or ${table.refundRial} >= 0`),
  ],
);

/**
 * Verified-purchase reviews. A customer may review a variety only once, and
 * only after a PAID order actually containing it — enforced in
 * modules/reviews/reviews.ts by checking order_lines, not trusted from the
 * client. The unique constraint below is the backstop against a race
 * producing two rows for the same (customer, variety).
 */
export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    varietyId: uuid("variety_id")
      .notNull()
      .references(() => varieties.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    /** The purchase that earned the right to review — kept for auditability. */
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    rating: smallint("rating").notNull(),
    comment: text("comment"),
    /**
     * Published immediately: there is no moderation queue or admin review
     * surface yet (see the admin-tooling note in modules/admin/auth.ts). A
     * false default here would silently hide every review a customer writes
     * with nobody to approve it.
     */
    isPublished: boolean("is_published").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("reviews_customer_variety_unique").on(table.customerId, table.varietyId),
    index("reviews_variety_published_idx").on(table.varietyId, table.isPublished),
    check("reviews_rating_range", sql`${table.rating} between 1 and 5`),
  ],
);

export type ReturnRequest = typeof returnRequests.$inferSelect;
export type NewReturnRequest = typeof returnRequests.$inferInsert;
export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
