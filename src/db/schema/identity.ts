import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * A customer, identified by phone number — the only identity Iranian
 * shoppers expect (see docs/MARKET-REVIEW.md). No password ever exists;
 * `otp_codes` is the entire authentication story.
 *
 * `totalKgPurchasedCache` and `currentStreakMonths` are denormalised reads,
 * not sources of truth — they exist so the passport page and a tier badge
 * don't need to replay the customer's whole order history on every request.
 * They are recomputed from `orders` inside modules/loyalty after every paid
 * order, the same "cache beside an append-only truth" shape as
 * `lots.quantity_on_hand_g` beside `stock_movements`.
 */
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Canonical `09xxxxxxxxx` form — see globals/digits.ts normalizeMobile. */
    mobile: varchar("mobile", { length: 11 }).notNull().unique(),
    displayName: varchar("display_name", { length: 128 }),
    totalKgPurchasedCache: integer("total_kg_purchased_cache").notNull().default(0),
    currentStreakMonths: integer("current_streak_months").notNull().default(0),
    longestStreakMonths: integer("longest_streak_months").notNull().default(0),
    pointsBalanceCache: bigint("points_balance_cache", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("customers_total_kg_non_negative", sql`${table.totalKgPurchasedCache} >= 0`),
    check("customers_points_balance_non_negative", sql`${table.pointsBalanceCache} >= 0`),
  ],
);

/**
 * One-time passwords, phone-number login.
 *
 * A row is created per request and consumed at most once. `attempts` caps
 * guessing a 5-digit code (100,000 possibilities is not a lot against an
 * unlimited-try endpoint); the check constraint is the hard backstop the
 * application logic must respect, not a substitute for it.
 */
export const otpCodes = pgTable(
  "otp_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    mobile: varchar("mobile", { length: 11 }).notNull(),
    /** SHA-256 of the code; the code itself is never stored here. */
    codeHash: varchar("code_hash", { length: 64 }).notNull(),
    /**
     * The plaintext code, but ONLY when ALLOW_DEV_OTP_PEEK is set — see that
     * flag's comment in globals/config.ts. Null on every real deployment.
     * This exists on the row (rather than as in-process memory) specifically
     * because Next.js bundles Server Actions and Route Handlers as separate
     * chunks that do not share module-level state; a plain in-memory Map
     * written by the action and read by the route handler silently missed
     * every write in exactly that split, which is how this column earned its
     * comment instead of just being deleted as an unnecessary idea.
     */
    devPlaintextCode: varchar("dev_plaintext_code", { length: 8 }),
    attempts: smallint("attempts").notNull().default(0),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The active-code lookup: latest unconsumed, unexpired code for a mobile.
    index("otp_codes_mobile_idx").on(table.mobile, table.createdAt),
    check("otp_codes_attempts_bounded", sql`${table.attempts} <= 5`),
  ],
);

export const addresses = pgTable(
  "addresses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    recipientName: varchar("recipient_name", { length: 128 }).notNull(),
    /** Canonical mobile of the person receiving the parcel; may differ from the account. */
    recipientMobile: varchar("recipient_mobile", { length: 11 }).notNull(),
    province: varchar("province", { length: 64 }).notNull(),
    city: varchar("city", { length: 64 }).notNull(),
    line1: text("line1").notNull(),
    postalCode: varchar("postal_code", { length: 10 }),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("addresses_customer_idx").on(table.customerId)],
);

export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type OtpCode = typeof otpCodes.$inferSelect;
export type Address = typeof addresses.$inferSelect;
export type NewAddress = typeof addresses.$inferInsert;
