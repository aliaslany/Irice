import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { lots, skus, varieties } from "./catalog";
import { addresses, customers } from "./identity";
import { orderStatusEnum, paymentProviderEnum, paymentStatusEnum } from "./enums";

/**
 * A cart is identified by an opaque cookie token, not a login — carrying
 * groceries around before you've proven who you are is the normal case.
 * `customerId` is attached once the shopper verifies an OTP at checkout, so
 * the same cart survives the login step instead of being rebuilt.
 */
export const carts = pgTable(
  "carts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cartToken: varchar("cart_token", { length: 64 }).notNull().unique(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("carts_customer_idx").on(table.customerId)],
);

/**
 * A cart line is a Variety + pack size, NOT a Sku or a Lot.
 *
 * This is the same rule docs/ARCHITECTURE.md gives for subscriptions: the lot
 * behind "10kg of Tarom Hashemi" can and will change between the moment it's
 * added to a cart and the moment checkout runs, so the cart must not pin one.
 * FEFO allocation happens once, at checkout, against current stock.
 */
export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    varietyId: uuid("variety_id")
      .notNull()
      .references(() => varieties.id, { onDelete: "restrict" }),
    packSizeG: integer("pack_size_g").notNull(),
    /** Number of packs of this size, not grams. */
    quantity: integer("quantity").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("cart_items_cart_variety_pack_unique").on(table.cartId, table.varietyId, table.packSizeG),
    check("cart_items_quantity_positive", sql`${table.quantity} > 0`),
  ],
);

/**
 * An order and its money are both frozen at checkout. Every rial and gram on
 * this table is a snapshot; nothing here is ever recomputed by joining back
 * to the current lot price, because a price change six months from now must
 * never rewrite what a customer was actually charged.
 */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Short human-facing code, e.g. for SMS and support calls: IR-4F82K1. */
    orderNumber: varchar("order_number", { length: 16 }).notNull().unique(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    addressId: uuid("address_id").references(() => addresses.id, { onDelete: "set null" }),

    // Shipping address is copied onto the order at checkout, not just
    // referenced — an address the customer later edits or deletes must not
    // change where an already-placed order says it shipped.
    shipRecipientName: varchar("ship_recipient_name", { length: 128 }).notNull(),
    shipRecipientMobile: varchar("ship_recipient_mobile", { length: 11 }).notNull(),
    shipProvince: varchar("ship_province", { length: 64 }).notNull(),
    shipCity: varchar("ship_city", { length: 64 }).notNull(),
    shipLine1: text("ship_line1").notNull(),
    shipPostalCode: varchar("ship_postal_code", { length: 10 }),

    status: orderStatusEnum("status").notNull().default("pending_payment"),

    subtotalRial: bigint("subtotal_rial", { mode: "number" }).notNull(),
    shippingFeeRial: bigint("shipping_fee_rial", { mode: "number" }).notNull(),
    /** Rial value of redeemed loyalty points; see modules/loyalty/points.ts. */
    discountRial: bigint("discount_rial", { mode: "number" }).notNull().default(0),
    totalRial: bigint("total_rial", { mode: "number" }).notNull(),
    totalWeightG: bigint("total_weight_g", { mode: "number" }).notNull(),

    pointsRedeemed: bigint("points_redeemed", { mode: "number" }).notNull().default(0),
    /** Filled in when the order transitions to `paid`; 0 until then. */
    pointsEarned: bigint("points_earned", { mode: "number" }).notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    /**
     * Set when an operator marks the order fulfilled (see admin/orders). This
     * is a stand-in for a real "delivered" event from a carrier integration,
     * which doesn't exist yet — see docs/ARCHITECTURE.md §7 on shipping. The
     * 10-day return guarantee is legally "10 days after delivery"
     * (docs/MARKET-REVIEW.md), and fulfilment date is the closest fact this
     * system actually has to that.
     */
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
  },
  (table) => [
    index("orders_customer_idx").on(table.customerId, table.createdAt),
    check("orders_subtotal_non_negative", sql`${table.subtotalRial} >= 0`),
    check("orders_total_non_negative", sql`${table.totalRial} >= 0`),
    check("orders_discount_bounded", sql`${table.discountRial} <= ${table.subtotalRial}`),
  ],
);

/**
 * One row per (lot, pack size) actually cut for the order. A single cart line
 * ("5 packs of 10kg Tarom Hashemi") can become two order lines if FEFO had to
 * split it across an old and a new lot — that split is the point: it is what
 * makes the shipped bags match their lot passports.
 */
export const orderLines = pgTable(
  "order_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    varietyId: uuid("variety_id")
      .notNull()
      .references(() => varieties.id, { onDelete: "restrict" }),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => lots.id, { onDelete: "restrict" }),
    skuId: uuid("sku_id").references(() => skus.id, { onDelete: "set null" }),
    packSizeG: integer("pack_size_g").notNull(),
    packs: integer("packs").notNull(),
    /** Snapshot of the pack's price at checkout; never re-derived later. */
    unitPriceRial: bigint("unit_price_rial", { mode: "number" }).notNull(),
    lineTotalRial: bigint("line_total_rial", { mode: "number" }).notNull(),
    lineWeightG: bigint("line_weight_g", { mode: "number" }).notNull(),
  },
  (table) => [
    index("order_lines_order_idx").on(table.orderId),
    index("order_lines_lot_idx").on(table.lotId),
    check("order_lines_packs_positive", sql`${table.packs} > 0`),
  ],
);

/**
 * One row per payment attempt. Orders can accumulate several rows (a failed
 * attempt, then a retry) — the order's own `status` is the single source of
 * truth for whether the customer has actually paid, never the presence of a
 * row here.
 */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    provider: paymentProviderEnum("provider").notNull(),
    /** The gateway's token for this attempt; what the callback URL carries back. */
    authority: varchar("authority", { length: 64 }).notNull().unique(),
    status: paymentStatusEnum("status").notNull().default("pending"),
    amountRial: bigint("amount_rial", { mode: "number" }).notNull(),
    /** The gateway's reference number for a completed transaction. */
    refId: varchar("ref_id", { length: 64 }),
    failureReason: text("failure_reason"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
  },
  (table) => [
    index("payments_order_idx").on(table.orderId),
    check("payments_amount_positive", sql`${table.amountRial} > 0`),
  ],
);

export type Cart = typeof carts.$inferSelect;
export type CartItem = typeof cartItems.$inferSelect;
export type NewCartItem = typeof cartItems.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderLine = typeof orderLines.$inferSelect;
export type NewOrderLine = typeof orderLines.$inferInsert;
/**
 * Dev/demo-only: the outcome a developer or the e2e test chose on the fake
 * gateway page, read back by FakePaymentProvider.verifyPayment.
 *
 * This exists on a table, not as in-process memory, for the identical
 * reason otp_codes.dev_plaintext_code does: the fake gateway's "succeed"
 * button runs as a Server Action and the callback that reads the outcome
 * runs as a Route Handler, and Next.js bundles those separately — a plain
 * module-level Map written by one was silently invisible to the other,
 * which is precisely the bug that made every "successful" fake payment in
 * this session verify as a failure until this table replaced it.
 *
 * Never populated, never read, and never even created outside `fake` as a
 * payment provider — ZarinPal never touches this table.
 */
export const fakePaymentOutcomes = pgTable("fake_payment_outcomes", {
  authority: varchar("authority", { length: 64 }).primaryKey(),
  outcome: varchar("outcome", { length: 16 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type FakePaymentOutcome = typeof fakePaymentOutcomes.$inferSelect;
