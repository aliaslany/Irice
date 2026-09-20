import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  certificateKindEnum,
  cropCycleEnum,
  grainTypeEnum,
  lotGradeEnum,
  lotStatusEnum,
} from "./enums";

/**
 * VARIETY — the marketing and SEO entity.
 *
 * ~10 rows, effectively static: هاشمی، طارم هاشمی، دمسیاه، صدری، فجر، شیرودی,
 * plus imported basmati lines. It owns content, imagery and cooking guidance.
 * It owns *no* stock and *no* price: those belong to a lot, because "Tarom
 * Hashemi" is not a thing you can count or price — only a specific harvest is.
 */
export const varieties = pgTable(
  "varieties",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 64 }).notNull().unique(),
    nameFa: varchar("name_fa", { length: 128 }).notNull(),
    nameEn: varchar("name_en", { length: 128 }),
    grainType: grainTypeEnum("grain_type").notNull(),
    /** Imported lines (Indian/Pakistani basmati) sit in the same catalog. */
    isImported: boolean("is_imported").notNull().default(false),
    summaryFa: text("summary_fa"),
    descriptionFa: text("description_fa"),
    /** Cooking guidance, aroma notes, elongation ratio — display-only. */
    attributes: jsonb("attributes").$type<Record<string, string>>().notNull().default({}),
    heroImageUrl: text("hero_image_url"),
    sortOrder: integer("sort_order").notNull().default(0),
    isPublished: boolean("is_published").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("varieties_published_idx").on(table.isPublished, table.sortOrder)],
);

/**
 * LOT — the inventory and provenance entity. The load-bearing wall.
 *
 * One milling batch from one origin in one harvest year. Stock lives here, in
 * GRAMS. Price lives here, as rial-per-kilogram. This is the unit of recall,
 * of costing, and of the public traceability page (the QR on the bag).
 */
export const lots = pgTable(
  "lots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    varietyId: uuid("variety_id")
      .notNull()
      .references(() => varieties.id, { onDelete: "restrict" }),
    /** Human-facing batch code printed on the bag, e.g. HSH-1405-07. */
    code: varchar("code", { length: 32 }).notNull().unique(),

    // --- Provenance: the differentiator, as columns rather than prose ---
    /** استان، e.g. گیلان / مازندران. */
    originProvince: varchar("origin_province", { length: 64 }).notNull(),
    /** شهر/شالیزار، e.g. فریدونکنار، تالش، آستانه اشرفیه. */
    originCity: varchar("origin_city", { length: 64 }).notNull(),
    millName: varchar("mill_name", { length: 128 }),
    /** JALALI year of harvest — 1405, not 2026. See globals/date.ts. */
    harvestYear: smallint("harvest_year").notNull(),
    cropCycle: cropCycleEnum("crop_cycle").notNull().default("first"),
    grade: lotGradeEnum("grade").notNull(),
    /** Quality measurements; nullable until the lab report lands. */
    moisturePct: numeric("moisture_pct", { precision: 4, scale: 2 }),
    brokenGrainPct: numeric("broken_grain_pct", { precision: 4, scale: 2 }),

    // --- Commerce ---
    /** Rial per kilogram. Every SKU price derives from this one number. */
    pricePerKgRial: bigint("price_per_kg_rial", { mode: "number" }).notNull(),
    /** Landed cost per kg; admin-only, drives the margin report. */
    costPerKgRial: bigint("cost_per_kg_rial", { mode: "number" }),

    // --- Inventory, in grams, always ---
    quantityOnHandG: bigint("quantity_on_hand_g", { mode: "number" }).notNull().default(0),
    quantityReservedG: bigint("quantity_reserved_g", { mode: "number" }).notNull().default(0),

    status: lotStatusEnum("status").notNull().default("incoming"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // FEFO lot selection reads exactly this: sellable lots of a variety,
    // oldest harvest first.
    index("lots_fefo_idx").on(table.varietyId, table.status, table.harvestYear),
    check("lots_on_hand_non_negative", sql`${table.quantityOnHandG} >= 0`),
    check("lots_reserved_non_negative", sql`${table.quantityReservedG} >= 0`),
    // The invariant that makes overselling a database error, not a race.
    check("lots_reserved_within_on_hand", sql`${table.quantityReservedG} <= ${table.quantityOnHandG}`),
    check("lots_price_positive", sql`${table.pricePerKgRial} > 0`),
    check("lots_harvest_year_jalali", sql`${table.harvestYear} between 1380 and 1500`),
  ],
);

/**
 * SKU — a pack size cut from a lot. The sellable entity.
 *
 * `priceRial` is materialised (not computed on read) so that an order line can
 * snapshot it and a price change never rewrites history. It is *derived* from
 * the lot's price-per-kg by modules/pricing, so a market move is one UPDATE on
 * the lot followed by one recalculation, not fifty hand edits.
 */
export const skus = pgTable(
  "skus",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => lots.id, { onDelete: "restrict" }),
    /** Pack size in grams: 1000 / 5000 / 10000 / 20000. */
    packSizeG: integer("pack_size_g").notNull(),
    /** Materialised price for this pack, in rial. */
    priceRial: bigint("price_rial", { mode: "number" }).notNull(),
    /** Packaging/handling delta applied on top of price-per-kg × weight. */
    packagingFeeRial: bigint("packaging_fee_rial", { mode: "number" }).notNull().default(0),
    barcode: varchar("barcode", { length: 32 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("skus_lot_pack_unique").on(table.lotId, table.packSizeG),
    index("skus_active_idx").on(table.isActive, table.lotId),
    check("skus_pack_size_positive", sql`${table.packSizeG} > 0`),
    check("skus_price_positive", sql`${table.priceRial} > 0`),
  ],
);

/** Lab reports and origin documents — the evidence behind the lot's claims. */
export const lotCertificates = pgTable(
  "lot_certificates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => lots.id, { onDelete: "cascade" }),
    kind: certificateKindEnum("kind").notNull(),
    issuer: varchar("issuer", { length: 128 }).notNull(),
    referenceNo: varchar("reference_no", { length: 64 }),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    fileUrl: text("file_url").notNull(),
    isPublic: boolean("is_public").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("lot_certificates_lot_idx").on(table.lotId)],
);

/**
 * Append-only price history per lot.
 *
 * This is a customer-facing feature, not an audit log: in a market where a 10kg
 * bag costs millions of Toman, showing the last 12 months of this variety's
 * price is a trust asset no competitor currently offers.
 */
export const lotPriceHistory = pgTable(
  "lot_price_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => lots.id, { onDelete: "cascade" }),
    pricePerKgRial: bigint("price_per_kg_rial", { mode: "number" }).notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    /** Who/what moved it: "admin:<id>" or "job:market-sync". */
    changedBy: varchar("changed_by", { length: 64 }).notNull(),
  },
  (table) => [index("lot_price_history_lot_time_idx").on(table.lotId, table.effectiveFrom)],
);

export const varietiesRelations = relations(varieties, ({ many }) => ({
  lots: many(lots),
}));

export const lotsRelations = relations(lots, ({ one, many }) => ({
  variety: one(varieties, { fields: [lots.varietyId], references: [varieties.id] }),
  skus: many(skus),
  certificates: many(lotCertificates),
  priceHistory: many(lotPriceHistory),
}));

export const skusRelations = relations(skus, ({ one }) => ({
  lot: one(lots, { fields: [skus.lotId], references: [lots.id] }),
}));

export type Variety = typeof varieties.$inferSelect;
export type NewVariety = typeof varieties.$inferInsert;
export type Lot = typeof lots.$inferSelect;
export type NewLot = typeof lots.$inferInsert;
export type Sku = typeof skus.$inferSelect;
export type NewSku = typeof skus.$inferInsert;
