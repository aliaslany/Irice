import { describe, expect, it } from "vitest";
import { RETURN_WINDOW_DAYS } from "../returns/eligibility";
import {
  breadcrumbLd,
  graphLd,
  organizationLd,
  productLd,
  returnPolicyLd,
  serializeJsonLd,
  varietyKeywords,
  websiteLd,
  withinMetaLength,
  type ProductLdInput,
} from "./structured-data";

const SITE = "https://irice.example";

function baseProduct(overrides: Partial<ProductLdInput> = {}): ProductLdInput {
  return {
    siteUrl: SITE,
    variety: {
      slug: "hashemi",
      nameFa: "هاشمی",
      nameEn: "Hashemi",
      summaryFa: "خلاصه",
      descriptionFa: "توضیح کامل",
      heroImageUrl: null,
      grainType: "long",
    },
    lots: [
      {
        lot: { code: "HSH-1405-02", harvestYear: 1405, originProvince: "گیلان", originCity: "آستانه اشرفیه" },
        skus: [
          { id: "sku-1", packSizeG: 5000, priceRial: 29_900_000 },
          { id: "sku-2", packSizeG: 10_000, priceRial: 59_000_000 },
        ],
      },
    ],
    reviewSummary: { averageRating: null, reviewCount: 0 },
    reviews: [],
    ...overrides,
  };
}

describe("serializeJsonLd()", () => {
  it("cannot be broken out of its <script> tag by catalog text", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<");
    // ...and it is still valid JSON that round-trips to the original string.
    expect(JSON.parse(out)).toEqual({ name: "</script><script>alert(1)</script>" });
  });

  it("escapes the line separators that terminate a JS string literal", () => {
    const LS = String.fromCharCode(0x2028);
    const PS = String.fromCharCode(0x2029);
    const text = `a${LS}b${PS}c`;
    const out = serializeJsonLd({ text });
    expect(out.includes(LS) || out.includes(PS)).toBe(false);
    expect(JSON.parse(out)).toEqual({ text });
  });

  it("keeps Persian text intact", () => {
    expect(JSON.parse(serializeJsonLd({ name: "طارم هاشمی" }))).toEqual({ name: "طارم هاشمی" });
  });
});

describe("returnPolicyLd()", () => {
  it("states exactly the window the returns module enforces", () => {
    expect(returnPolicyLd()).toMatchObject({
      "@type": "MerchantReturnPolicy",
      applicableCountry: "IR",
      merchantReturnDays: RETURN_WINDOW_DAYS,
    });
  });
});

describe("organizationLd() / websiteLd() / graphLd()", () => {
  it("links the website to the store by @id, in one graph", () => {
    const graph = graphLd([organizationLd(SITE), websiteLd(SITE)]);
    const [org, site] = graph["@graph"] as Record<string, unknown>[];
    expect(org?.["@type"]).toBe("OnlineStore");
    expect(site?.publisher).toEqual({ "@id": org?.["@id"] });
    expect(site?.inLanguage).toBe("fa-IR");
  });
});

describe("breadcrumbLd()", () => {
  it("numbers items from 1 and makes every URL absolute", () => {
    const ld = breadcrumbLd(SITE, [
      { name: "انواع برنج", path: "/" },
      { name: "هاشمی", path: "/rice/hashemi" },
    ]);
    expect(ld.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "انواع برنج", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "هاشمی", item: `${SITE}/rice/hashemi` },
    ]);
  });
});

describe("productLd()", () => {
  it("emits one IRR offer per SKU, each carrying the return policy", () => {
    const ld = productLd(baseProduct());
    const offers = ld.offers as Record<string, unknown>[];
    expect(offers).toHaveLength(2);
    expect(offers[0]).toMatchObject({ priceCurrency: "IRR", price: 29_900_000, url: `${SITE}/lot/HSH-1405-02` });
    expect(offers[0]?.hasMerchantReturnPolicy).toEqual(returnPolicyLd());
  });

  it("prefers the full description over the one-line summary", () => {
    expect(productLd(baseProduct()).description).toBe("توضیح کامل");
  });

  it("never claims a rating when nobody has reviewed yet", () => {
    const ld = productLd(baseProduct());
    expect(ld).not.toHaveProperty("aggregateRating");
    expect(ld).not.toHaveProperty("review");
  });

  it("embeds real reviews, capped, alongside the aggregate", () => {
    const reviews = Array.from({ length: 8 }, (_, i) => ({
      rating: 4,
      comment: i === 0 ? "عالی" : null,
      createdAt: new Date("2026-09-01T00:00:00Z"),
      reviewerName: "خریدار تأییدشده",
    }));
    const ld = productLd(baseProduct({ reviewSummary: { averageRating: 4.25, reviewCount: 8 }, reviews }));
    expect(ld.aggregateRating).toMatchObject({ ratingValue: 4.3, reviewCount: 8, bestRating: 5 });
    const embedded = ld.review as Record<string, unknown>[];
    expect(embedded).toHaveLength(5);
    expect(embedded[0]).toMatchObject({ reviewBody: "عالی", datePublished: "2026-09-01" });
    expect(embedded[1]).not.toHaveProperty("reviewBody");
  });

  it("lists each distinct lot origin once", () => {
    const input = baseProduct();
    input.lots.push({ ...input.lots[0]!, lot: { ...input.lots[0]!.lot, code: "HSH-1404-01" } });
    const props = productLd(input).additionalProperty as { name: string; value: string }[];
    expect(props.filter((p) => p.name === "خاستگاه")).toHaveLength(1);
  });
});

describe("varietyKeywords()", () => {
  it("covers the searched names and real origins, with no duplicates", () => {
    const keywords = varietyKeywords({ nameFa: "هاشمی", nameEn: "Hashemi", grainType: "long" }, ["گیلان", "گیلان"]);
    expect(keywords).toContain("خرید برنج هاشمی");
    expect(keywords).toContain("Hashemi rice");
    expect(keywords).toContain("برنج گیلان");
    expect(new Set(keywords).size).toBe(keywords.length);
  });
});

describe("withinMetaLength()", () => {
  it("appends detail only when the result stays within the snippet limit", () => {
    expect(withinMetaLength("کوتاه", "جزئیات")).toBe("کوتاه جزئیات");
    const long = "ب".repeat(150);
    expect(withinMetaLength(long, "جزئیات بیشتر از ده حرف")).toBe(long);
  });
});
