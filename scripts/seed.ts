/**
 * Development seed.
 *
 * Realistic shapes, not lorem ipsum: real variety names, real growing regions,
 * and prices in the range reported for Khordad 1405 (premium Hashemi around
 * 593,000 Toman/kg). Two lots of the same variety at different harvest years
 * exist on purpose — that is the case FEFO and the freshness badge are for,
 * and it is the case a single-lot fixture would never exercise.
 *
 * Idempotent: running it twice leaves the same rows.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db/client";
import { lotCertificates, lotPriceHistory, lots, skus, varieties } from "../src/db/schema/index";
import { fromToman, rial } from "../src/globals/money";
import { kg, PACK_SIZES_G } from "../src/globals/weight";
import { derivePrice, roundToDisplayStep } from "../src/modules/pricing/price";
import { fromJalali } from "../src/globals/date";

const VARIETIES = [
  {
    slug: "tarom-hashemi",
    nameFa: "طارم هاشمی",
    nameEn: "Tarom Hashemi",
    grainType: "long" as const,
    sortOrder: 1,
    summaryFa:
      "عطری‌ترین برنج ایرانی و پرطرفدارترین رقم شمال. دانه بلند و باریک، با قد کشیدن بالا و عطری که هنگام پخت کل خانه را برمی‌دارد.",
    attributes: { عطر: "بسیار بالا", "قد کشیدن": "زیاد", "زمان پخت": "کوتاه" },
  },
  {
    slug: "hashemi",
    nameFa: "هاشمی",
    nameEn: "Hashemi",
    grainType: "long" as const,
    sortOrder: 2,
    summaryFa:
      "رقم اصیل گیلان با دانه بلند و نرمی بالا. انتخاب همیشگی برای چلو مجلسی.",
    attributes: { عطر: "بالا", نرمی: "زیاد" },
  },
  {
    slug: "domsiah",
    nameFa: "دمسیاه",
    nameEn: "Domsiah",
    grainType: "long" as const,
    sortOrder: 3,
    summaryFa: "دانه باریک با دُم تیره، عطر قوی و طعم خاص. کمیاب‌تر از هاشمی.",
    attributes: { عطر: "بسیار بالا", کمیابی: "بالا" },
  },
  {
    slug: "fajr",
    nameFa: "فجر",
    nameEn: "Fajr",
    grainType: "long" as const,
    sortOrder: 4,
    summaryFa: "پرمحصول و مقرون‌به‌صرفه، با قد کشیدن خوب. انتخاب اقتصادی مصرف روزانه.",
    attributes: { عطر: "متوسط", "صرفه اقتصادی": "بالا" },
  },
];

const LOTS = [
  {
    code: "THM-1405-03",
    varietySlug: "tarom-hashemi",
    originProvince: "مازندران",
    originCity: "فریدون‌کنار",
    millName: "شالی‌کوبی برادران رضایی",
    harvestYear: 1405,
    cropCycle: "first" as const,
    grade: "momtaz" as const,
    moisturePct: "8.60",
    brokenGrainPct: "2.10",
    pricePerKgToman: 593_000,
    quantityKg: 4200,
    receivedJalali: { jy: 1405, jm: 6, jd: 12 },
    history: [
      { jalali: { jy: 1405, jm: 6, jd: 12 }, toman: 561_000 },
      { jalali: { jy: 1405, jm: 6, jd: 25 }, toman: 578_000 },
      { jalali: { jy: 1405, jm: 6, jd: 29 }, toman: 593_000 },
    ],
    certificates: [
      {
        kind: "lab_analysis" as const,
        issuer: "آزمایشگاه کنترل کیفیت مواد غذایی مازندران",
        referenceNo: "MZ-1405-88213",
        issuedJalali: { jy: 1405, jm: 6, jd: 14 },
        fileUrl: "/certificates/THM-1405-03-lab.pdf",
      },
      {
        kind: "origin" as const,
        issuer: "اتحادیه شالی‌کاران فریدون‌کنار",
        referenceNo: "FK-4417",
        issuedJalali: { jy: 1405, jm: 6, jd: 10 },
        fileUrl: "/certificates/THM-1405-03-origin.pdf",
      },
    ],
  },
  {
    // Last year's crop of the same variety: cheaper, ships first under FEFO.
    code: "THM-1404-11",
    varietySlug: "tarom-hashemi",
    originProvince: "مازندران",
    originCity: "بابلسر",
    millName: "شالی‌کوبی کاسپین",
    harvestYear: 1404,
    cropCycle: "first" as const,
    grade: "darajeh_yek" as const,
    moisturePct: "8.20",
    brokenGrainPct: "3.40",
    pricePerKgToman: 512_000,
    quantityKg: 900,
    receivedJalali: { jy: 1404, jm: 7, jd: 3 },
    history: [{ jalali: { jy: 1404, jm: 7, jd: 3 }, toman: 512_000 }],
    certificates: [],
  },
  {
    code: "HSH-1405-02",
    varietySlug: "hashemi",
    originProvince: "گیلان",
    originCity: "آستانه اشرفیه",
    millName: "شالی‌کوبی سپیدرود",
    harvestYear: 1405,
    cropCycle: "first" as const,
    grade: "momtaz" as const,
    moisturePct: "8.90",
    brokenGrainPct: "1.80",
    pricePerKgToman: 571_000,
    quantityKg: 3100,
    receivedJalali: { jy: 1405, jm: 6, jd: 18 },
    history: [
      { jalali: { jy: 1405, jm: 6, jd: 18 }, toman: 549_000 },
      { jalali: { jy: 1405, jm: 6, jd: 28 }, toman: 571_000 },
    ],
    certificates: [
      {
        kind: "lab_analysis" as const,
        issuer: "آزمایشگاه مرکزی گیلان",
        referenceNo: "GL-1405-20714",
        issuedJalali: { jy: 1405, jm: 6, jd: 20 },
        fileUrl: "/certificates/HSH-1405-02-lab.pdf",
      },
    ],
  },
  {
    code: "DMS-1405-01",
    varietySlug: "domsiah",
    originProvince: "گیلان",
    originCity: "تالش",
    millName: "شالی‌کوبی تالش",
    harvestYear: 1405,
    cropCycle: "first" as const,
    grade: "momtaz" as const,
    moisturePct: "8.40",
    brokenGrainPct: "2.60",
    pricePerKgToman: 618_000,
    quantityKg: 640,
    receivedJalali: { jy: 1405, jm: 6, jd: 22 },
    history: [{ jalali: { jy: 1405, jm: 6, jd: 22 }, toman: 618_000 }],
    certificates: [],
  },
  {
    code: "FJR-1405-05",
    varietySlug: "fajr",
    originProvince: "مازندران",
    originCity: "ساری",
    millName: "شالی‌کوبی تجن",
    harvestYear: 1405,
    cropCycle: "first" as const,
    grade: "darajeh_yek" as const,
    moisturePct: "9.10",
    brokenGrainPct: "4.20",
    pricePerKgToman: 348_000,
    quantityKg: 7800,
    receivedJalali: { jy: 1405, jm: 6, jd: 9 },
    history: [{ jalali: { jy: 1405, jm: 6, jd: 9 }, toman: 348_000 }],
    certificates: [],
  },
];

/** Packaging costs more per kilo on small bags; this is the real shape of it. */
const PACKAGING_FEE_TOMAN: Record<number, number> = {
  1000: 12_000,
  5000: 25_000,
  10_000: 38_000,
  20_000: 60_000,
};

async function seed(): Promise<void> {
  console.log("seeding…");

  for (const v of VARIETIES) {
    await db
      .insert(varieties)
      .values({
        slug: v.slug,
        nameFa: v.nameFa,
        nameEn: v.nameEn,
        grainType: v.grainType,
        summaryFa: v.summaryFa,
        attributes: v.attributes,
        sortOrder: v.sortOrder,
        isPublished: true,
      })
      .onConflictDoUpdate({
        target: varieties.slug,
        set: { nameFa: v.nameFa, summaryFa: v.summaryFa, isPublished: true, updatedAt: new Date() },
      });
  }

  for (const l of LOTS) {
    const variety = await db.query.varieties.findFirst({
      where: eq(varieties.slug, l.varietySlug),
    });
    if (!variety) throw new Error(`missing variety ${l.varietySlug}`);

    const pricePerKgRial = fromToman(l.pricePerKgToman);
    const [lot] = await db
      .insert(lots)
      .values({
        varietyId: variety.id,
        code: l.code,
        originProvince: l.originProvince,
        originCity: l.originCity,
        millName: l.millName,
        harvestYear: l.harvestYear,
        cropCycle: l.cropCycle,
        grade: l.grade,
        moisturePct: l.moisturePct,
        brokenGrainPct: l.brokenGrainPct,
        pricePerKgRial,
        quantityOnHandG: kg(l.quantityKg),
        status: "active",
        receivedAt: fromJalali(l.receivedJalali),
      })
      .onConflictDoUpdate({
        target: lots.code,
        set: { pricePerKgRial, quantityOnHandG: kg(l.quantityKg), status: "active", updatedAt: new Date() },
      })
      .returning();
    if (!lot) throw new Error(`failed to upsert lot ${l.code}`);

    // Prices are DERIVED, never typed by hand — the same call the storefront makes.
    for (const packSizeG of PACK_SIZES_G) {
      const packagingFeeRial = fromToman(PACKAGING_FEE_TOMAN[packSizeG] ?? 0);
      const { totalRial } = derivePrice({ pricePerKgRial, packSizeG, packagingFeeRial });
      const priceRial = roundToDisplayStep(totalRial);
      await db
        .insert(skus)
        .values({ lotId: lot.id, packSizeG, priceRial, packagingFeeRial, isActive: true })
        .onConflictDoUpdate({
          target: [skus.lotId, skus.packSizeG],
          set: { priceRial, packagingFeeRial, updatedAt: new Date() },
        });
    }

    await db.delete(lotPriceHistory).where(eq(lotPriceHistory.lotId, lot.id));
    for (const entry of l.history) {
      await db.insert(lotPriceHistory).values({
        lotId: lot.id,
        pricePerKgRial: fromToman(entry.toman),
        effectiveFrom: fromJalali(entry.jalali),
        changedBy: "seed",
      });
    }

    await db.delete(lotCertificates).where(eq(lotCertificates.lotId, lot.id));
    for (const cert of l.certificates) {
      await db.insert(lotCertificates).values({
        lotId: lot.id,
        kind: cert.kind,
        issuer: cert.issuer,
        referenceNo: cert.referenceNo,
        issuedAt: fromJalali(cert.issuedJalali),
        fileUrl: cert.fileUrl,
        isPublic: true,
      });
    }
  }

  const [counts] = await db
    .select({
      varieties: sql<string>`(select count(*) from ${varieties})`,
      lots: sql<string>`(select count(*) from ${lots})`,
      skus: sql<string>`(select count(*) from ${skus})`,
    })
    .from(sql`(select 1) as t`);
  console.log("seeded:", counts);
}

await seed();
process.exit(0);
