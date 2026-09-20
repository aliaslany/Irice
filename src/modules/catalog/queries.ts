/**
 * Catalog reads.
 *
 * The storefront's only door to the database. Pages call these; they never
 * import drizzle or a table directly, so the Variety/Lot/Sku shape can change
 * without touching a page component.
 *
 * Every query here filters to what is *publicly sellable* — published
 * varieties, active lots with free stock, active SKUs. A quarantined lot must
 * never reach a page by accident, so that filter lives here rather than in
 * each caller. The one deliberate exception is documented on getLotPassport.
 */
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "../../db/client";
import {
  lotCertificates,
  lotPriceHistory,
  lots,
  skus,
  varieties,
  type Lot,
  type Sku,
  type Variety,
} from "../../db/schema/index";

/** Free stock: on hand minus what other carts are holding. */
const availableG = sql`${lots.quantityOnHandG} - ${lots.quantityReservedG}`;

const isSellableLot = and(eq(lots.status, "active"), gt(availableG, 0));

export interface VarietyCard {
  variety: Variety;
  /** Lowest rial-per-kg across the variety's sellable lots, or null if none. */
  fromPricePerKgRial: number | null;
  /** Newest harvest year in stock — the freshness signal on the card. */
  latestHarvestYear: number | null;
  inStock: boolean;
}

/** Published varieties with a price-from and stock summary, for the index. */
export async function listVarietyCards(): Promise<VarietyCard[]> {
  const rows = await db
    .select({
      variety: varieties,
      fromPricePerKgRial: sql<string | null>`min(${lots.pricePerKgRial})`,
      latestHarvestYear: sql<string | null>`max(${lots.harvestYear})`,
      sellableLots: sql<string>`count(${lots.id})`,
    })
    .from(varieties)
    .leftJoin(lots, and(eq(lots.varietyId, varieties.id), isSellableLot))
    .where(eq(varieties.isPublished, true))
    .groupBy(varieties.id)
    .orderBy(asc(varieties.sortOrder), asc(varieties.nameFa));

  return rows.map((row) => ({
    variety: row.variety,
    // Postgres returns bigint aggregates as strings; coerce at the boundary.
    fromPricePerKgRial: row.fromPricePerKgRial === null ? null : Number(row.fromPricePerKgRial),
    latestHarvestYear: row.latestHarvestYear === null ? null : Number(row.latestHarvestYear),
    inStock: Number(row.sellableLots) > 0,
  }));
}

export interface LotWithSkus {
  lot: Lot;
  skus: Sku[];
}

export interface VarietyDetail {
  variety: Variety;
  /** Sellable lots, oldest harvest first — the order they will actually ship. */
  lots: LotWithSkus[];
}

/** A variety and everything its product page renders. */
export async function getVarietyBySlug(slug: string): Promise<VarietyDetail | null> {
  const variety = await db.query.varieties.findFirst({
    where: and(eq(varieties.slug, slug), eq(varieties.isPublished, true)),
  });
  if (!variety) return null;

  const sellableLots = await db
    .select()
    .from(lots)
    .where(and(eq(lots.varietyId, variety.id), isSellableLot))
    // FEFO order: what ships first is what we show first.
    .orderBy(asc(lots.harvestYear), asc(lots.code));

  if (sellableLots.length === 0) return { variety, lots: [] };

  const activeSkus = await db
    .select()
    .from(skus)
    .where(
      and(
        eq(skus.isActive, true),
        inArray(
          skus.lotId,
          sellableLots.map((lot) => lot.id),
        ),
      ),
    )
    .orderBy(asc(skus.packSizeG));

  return {
    variety,
    lots: sellableLots.map((lot) => ({
      lot,
      skus: activeSkus.filter((sku) => sku.lotId === lot.id),
    })),
  };
}

export interface LotPassport {
  lot: Lot;
  variety: Variety;
  skus: Sku[];
  certificates: (typeof lotCertificates.$inferSelect)[];
  priceHistory: (typeof lotPriceHistory.$inferSelect)[];
}

/**
 * The traceability page behind the QR code printed on the bag.
 *
 * Deliberately NOT filtered by lot status. A customer holding a bag from a
 * depleted — or recalled — lot still has the right to read its passport; that
 * is the entire promise the QR code makes. Only the *sale* of a lot is gated
 * by status, and that gate is in the queries above.
 */
export async function getLotPassport(code: string): Promise<LotPassport | null> {
  const found = (
    await db
      .select({ lot: lots, variety: varieties })
      .from(lots)
      .innerJoin(varieties, eq(lots.varietyId, varieties.id))
      .where(eq(lots.code, code))
      .limit(1)
  )[0];
  if (!found) return null;

  const [lotSkus, certificates, priceHistory] = await Promise.all([
    db.select().from(skus).where(eq(skus.lotId, found.lot.id)).orderBy(asc(skus.packSizeG)),
    db
      .select()
      .from(lotCertificates)
      .where(and(eq(lotCertificates.lotId, found.lot.id), eq(lotCertificates.isPublic, true)))
      .orderBy(desc(lotCertificates.issuedAt)),
    db
      .select()
      .from(lotPriceHistory)
      .where(eq(lotPriceHistory.lotId, found.lot.id))
      .orderBy(asc(lotPriceHistory.effectiveFrom)),
  ]);

  return { lot: found.lot, variety: found.variety, skus: lotSkus, certificates, priceHistory };
}

/** Everything the sitemap lists. */
export async function listPublicRoutes(): Promise<{
  varieties: { slug: string; updatedAt: Date }[];
  lotCodes: { code: string; updatedAt: Date }[];
}> {
  const [varietyRows, lotRows] = await Promise.all([
    db
      .select({ slug: varieties.slug, updatedAt: varieties.updatedAt })
      .from(varieties)
      .where(eq(varieties.isPublished, true)),
    // Every lot that has reached customers keeps a public passport forever;
    // only never-received lots are withheld.
    db
      .select({ code: lots.code, updatedAt: lots.updatedAt })
      .from(lots)
      .where(sql`${lots.status} <> 'incoming'`),
  ]);
  return { varieties: varietyRows, lotCodes: lotRows };
}
