/**
 * schema.org structured data (JSON-LD) and the metadata pieces every page
 * shares.
 *
 * Pure builders: every function takes the site URL and the catalog rows it
 * describes, and returns a plain object. Pages only choose which builders to
 * call. That keeps one rule enforceable in one place — **the markup never
 * states anything the page doesn't**: no placeholder rating, no invented
 * shipping promise, no return window other than the one modules/returns
 * actually enforces.
 */
import { RETURN_WINDOW_DAYS } from "../returns/eligibility";
import { toPersianDigits } from "../../globals/digits";

export const SITE_NAME_FA = "آیرایس";
export const SITE_TAGLINE_FA = "برنج ایرانی مستقیم از کارخانه";

/**
 * Next merges `openGraph` shallowly: a page that sets its own `openGraph`
 * replaces the layout's whole object, silently dropping `siteName` and
 * `locale`. Every page spreads this in instead of restating it.
 */
export const OPEN_GRAPH_BASE = {
  type: "website",
  locale: "fa_IR",
  siteName: SITE_NAME_FA,
} as const;

const GRAIN_TYPE_FA: Record<string, string> = {
  long: "دانه بلند",
  medium: "دانه متوسط",
  short: "دانه کوتاه",
};

export function grainTypeLabel(grainType: string): string {
  return GRAIN_TYPE_FA[grainType] ?? grainType;
}

type JsonLd = Record<string, unknown>;

// Built from char codes: written as literal characters these are invisible
// in the source, and a literal one inside a regex literal is a syntax error.
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

/**
 * Serialise for a `<script type="application/ld+json">` body. Plain
 * JSON.stringify is not enough: a catalog string containing `</script>` would
 * close the tag early and let the rest be parsed as HTML. Escaping `<`, `>`
 * and `&` as \u sequences is still valid JSON, and the two line-separator
 * code points are escaped because they end a JavaScript string literal.
 */
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replaceAll(LINE_SEPARATOR, "\\u2028")
    .replaceAll(PARAGRAPH_SEPARATOR, "\\u2029");
}

/** The store itself — rendered once, on the home page. */
export function organizationLd(siteUrl: string): JsonLd {
  return {
    "@type": "OnlineStore",
    "@id": `${siteUrl}/#organization`,
    name: SITE_NAME_FA,
    description: SITE_TAGLINE_FA,
    url: siteUrl,
    logo: `${siteUrl}/icon.svg`,
    areaServed: { "@type": "Country", name: "IR" },
    hasMerchantReturnPolicy: returnPolicyLd(),
  };
}

export function websiteLd(siteUrl: string): JsonLd {
  return {
    "@type": "WebSite",
    "@id": `${siteUrl}/#website`,
    name: SITE_NAME_FA,
    url: siteUrl,
    inLanguage: "fa-IR",
    publisher: { "@id": `${siteUrl}/#organization` },
  };
}

/** Several nodes in one script tag, sharing @context. */
export function graphLd(nodes: JsonLd[]): JsonLd {
  return { "@context": "https://schema.org", "@graph": nodes };
}

/**
 * The 10-day guarantee, stated exactly as modules/returns enforces it — the
 * window is counted from delivery, which is what merchantReturnDays means.
 * Return method and fees are left out rather than guessed: nothing in the
 * codebase fixes either one yet.
 */
export function returnPolicyLd(): JsonLd {
  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "IR",
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: RETURN_WINDOW_DAYS,
  };
}

export interface BreadcrumbItem {
  name: string;
  /** Site-relative path, e.g. "/rice/hashemi". */
  path: string;
}

export function breadcrumbLd(siteUrl: string, items: BreadcrumbItem[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${siteUrl}${item.path}`,
    })),
  };
}

export interface ProductLdInput {
  siteUrl: string;
  variety: {
    slug: string;
    nameFa: string;
    nameEn: string | null;
    summaryFa: string | null;
    descriptionFa: string | null;
    heroImageUrl: string | null;
    grainType: string;
  };
  /** Only lots the page actually offers for sale — never depleted or quarantined ones. */
  lots: {
    lot: { code: string; harvestYear: number; originProvince: string; originCity: string };
    skus: { id: string; packSizeG: number; priceRial: number }[];
  }[];
  reviewSummary: { averageRating: number | null; reviewCount: number };
  reviews: { rating: number; comment: string | null; createdAt: Date; reviewerName: string }[];
}

/** How many individual reviews to embed — enough to be representative, not the whole list. */
const EMBEDDED_REVIEW_LIMIT = 5;

/**
 * Product markup for a variety page.
 *
 * Offers are priced in IRR because schema.org has no Toman currency code —
 * the page shows Toman, the markup states rial, and the two differ by a
 * factor of ten by definition. Every offer is InStock because the page only
 * lists lots with free stock (modules/catalog/queries' sellable filter).
 */
export function productLd(input: ProductLdInput): JsonLd {
  const { siteUrl, variety, lots, reviewSummary, reviews } = input;
  const origins = [...new Set(lots.map(({ lot }) => `${lot.originCity}، ${lot.originProvince}`))];

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${siteUrl}/rice/${variety.slug}#product`,
    name: variety.nameFa,
    ...(variety.nameEn ? { alternateName: variety.nameEn } : {}),
    description: variety.descriptionFa ?? variety.summaryFa ?? undefined,
    category: "برنج ایرانی",
    url: `${siteUrl}/rice/${variety.slug}`,
    brand: { "@type": "Brand", name: SITE_NAME_FA },
    ...(variety.heroImageUrl ? { image: variety.heroImageUrl } : {}),
    additionalProperty: [
      { "@type": "PropertyValue", name: "نوع دانه", value: grainTypeLabel(variety.grainType) },
      ...origins.map((origin) => ({ "@type": "PropertyValue", name: "خاستگاه", value: origin })),
    ],
    // One offer per SKU. The lot code is part of the name because two lots of
    // the same variety sell the same pack size at different prices — without
    // it the feed carries several identical names with conflicting prices,
    // which is ambiguous to a crawler and wrong to a shopper.
    offers: lots.flatMap(({ lot, skus }) =>
      skus.map((sku) => ({
        "@type": "Offer",
        sku: sku.id,
        name: `${variety.nameFa} ${toPersianDigits(String(sku.packSizeG / 1000))} کیلوگرم — محموله ${lot.code}`,
        price: sku.priceRial,
        priceCurrency: "IRR",
        availability: "https://schema.org/InStock",
        itemCondition: "https://schema.org/NewCondition",
        productionDate: String(lot.harvestYear),
        url: `${siteUrl}/lot/${lot.code}`,
        seller: { "@id": `${siteUrl}/#organization` },
        hasMerchantReturnPolicy: returnPolicyLd(),
      })),
    ),
    // Google requires a real review count behind this — never a placeholder
    // seed rating. Omitted entirely, not zeroed, when nobody has reviewed yet.
    ...(reviewSummary.reviewCount > 0 && reviewSummary.averageRating !== null
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: Number(reviewSummary.averageRating.toFixed(1)),
            reviewCount: reviewSummary.reviewCount,
            bestRating: 5,
            worstRating: 1,
          },
          review: reviews.slice(0, EMBEDDED_REVIEW_LIMIT).map((review) => ({
            "@type": "Review",
            author: { "@type": "Person", name: review.reviewerName },
            datePublished: review.createdAt.toISOString().slice(0, 10),
            reviewRating: { "@type": "Rating", ratingValue: review.rating, bestRating: 5, worstRating: 1 },
            ...(review.comment ? { reviewBody: review.comment } : {}),
          })),
        }
      : {}),
  };
}

/**
 * Meta keywords for a variety page. Google ignores this tag and Bing
 * barely weighs it; it's kept honest and short (the names people actually
 * search, plus the lots' real origins) rather than stuffed.
 */
export function varietyKeywords(
  variety: { nameFa: string; nameEn: string | null; grainType: string },
  originProvinces: string[],
): string[] {
  const keywords = [
    variety.nameFa,
    `برنج ${variety.nameFa}`,
    `خرید برنج ${variety.nameFa}`,
    `قیمت برنج ${variety.nameFa}`,
    ...(variety.nameEn ? [`${variety.nameEn} rice`] : []),
    `برنج ${grainTypeLabel(variety.grainType)}`,
    ...originProvinces.map((province) => `برنج ${province}`),
    "برنج ایرانی",
  ];
  return [...new Set(keywords)];
}

/** Meta descriptions past ~160 characters get truncated in results — only append detail that fits. */
const META_DESCRIPTION_MAX = 160;

export function withinMetaLength(base: string, detail: string): string {
  const combined = `${base} ${detail}`;
  return combined.length <= META_DESCRIPTION_MAX ? combined : base;
}
