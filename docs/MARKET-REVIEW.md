# Irice — Market Review

_Compiled 2026-09-17. Sources are web search results; Iranian retail domains are
blocked by this environment's egress proxy, so site features are summarised from
search/engine metadata, not from first-hand page inspection. Verify before
treating any single claim as fact._

## 1. Iranian online rice sellers

### 1.1 Specialist D2C shops (the direct competitors)

| Site | Position | What they lead with |
|---|---|---|
| [caspianrice.com](https://caspianrice.com/) | Brand D2C, operating since 1397 | Located in the northern growing belt, direct access to paddies and mills; per-variety category pages (Tarom Hashemi, Hashemi, Domsiah); installment purchase (اقساطی) |
| [berenj.one](https://berenj.one/shop/) | Factory-direct | "From the factory", authenticity guarantee + after-sales service; positions itself as the first mill-owned online store with online and in-person ordering |
| [riceonline.ir](https://www.riceonline.ir/) | Factory-direct | Installment sales, free shipping, 10-day return guarantee from delivery |
| [berenjetalesh.com](https://berenjetalesh.com/) | Grower D2C | Sells from its own paddies, explicitly "no middlemen" |
| [sadrarice.com](https://sadrarice.com/) | Brand D2C | Quality/grade-led merchandising |
| [allrice.ir](https://allrice.ir/) | Multi-brand centre | Iranian **and** imported rice at the government rate; farmer-direct claim |
| [berenjforush.ir](https://berenjforush.ir/), [berenj-hashemi.ir](https://berenj-hashemi.ir/), [baranrice.ir](https://baranrice.ir/) | Long-tail single-variety shops | Variety-specific SEO landers (Hashemi, Domsiah Sadri Gilan), "100% pure", free shipping |

### 1.2 Horizontal platforms (where the volume actually is)

- [Digikala](https://www.digikala.com/) — free shipping, cash on delivery, returns guarantee; 10 kg Tarom Hashemi SKUs are a standard listing format.
- **Snapp! Market / Okala** — grocery delivery; all three (plus Digikala) are connected to the کالابرگ (electronic food-stamp) system with free home delivery, which matters for staple goods like rice.
- [emalls.ir](https://emalls.ir/لیست-قیمت_برنج~Category~30260) — price comparison across Iranian, Indian and Pakistani rice with seller lists.
- [buskool.com](https://www.buskool.com/product-list/category/برنج) — B2B/wholesale marketplace ("خرید برنج عمده").
- [netchain.ir](https://netchain.ir/blog/بهترین-سایت-خرید-برنج) — directory/affiliate listicle ranking rice shops; a discovery channel worth being in.

### 1.3 What the Iranian market signals about product design

- **Price is the headline and it moves fast.** Reported Khordad 1405 figures: premium Hashemi 10 kg ≈ 5,930,000 T; Tarom Hashemi (Dane Tala) 10 kg ≈ 5,000,000 T ([Eghtesad Online](https://www.eghtesadonline.com/fa/news/2145387/)). At that ticket size, **installments (فروش اقساطی) and free shipping are table stakes**, not perks — three of the leading specialists advertise both.
- **Trust is sold through provenance, not branding.** Every serious seller claims mill-direct or farm-direct sourcing and "no middlemen". Origin (فریدونکنار، تالش، آستانه، گیلان/مازندران) is used as the quality proxy.
- **Variety is the primary navigation axis** — Hashemi, Tarom Hashemi, Domsiah, Sadri, Fajr, Shiroudi — not price or brand.
- **Guarantees are explicit and numeric**: 10-day return from delivery, authenticity guarantee, "100% pure".
- Imported rice (Indian/Pakistani basmati) is a real adjacent catalog, and price-comparison sites treat it as one market.

## 2. The globals

Note: the repository is empty (no commits on any branch), so there is no
`globals.css` / `globals.ts` / global config to review. "Globals" is read here as
the **global/international players**. If a globals *file* was meant, section 5 of
ARCHITECTURE.md specifies what that layer should contain.

### 2.1 Diaspora storefronts (USA/EU) — the export-facing comparison set

| Site | Model | Notable |
|---|---|---|
| [UNIQOP](https://uniqop.com/) | Online Persian grocery, USA | Free US shipping over $120; curated Persian pantry with rice as anchor SKU |
| [Persian Basket](https://persianbasket.com/food/rice-basmati.html) | Persian grocery | Deep basmati assortment: Mihan, Shah Taj, India Gate, Dunar Sella |
| [CyrusCrafts](https://www.cyruscrafts.com/categories/96/persian-rice) | Persian goods exporter | Sells Persian rice **bulk and retail** side by side; per-brand pages (e.g. [Golestan](https://www.cyruscrafts.com/brand/59-golestan)) |
| [Koolleh Shop](https://www.shop.koolleh.com/product/persian-domsiah-rice/) | Persian grocery | Single-variety detail pages (Domsiah) |
| [Mediterranean Bazaar](https://www.meditbazaar.com/) | Regional grocer | Local (DFW) delivery + nationwide shipping — the hybrid local/ship model |
| [Ersaly](https://www.ersaly.com/product-category/food-grocery/rice/) | Organic/natural angle | "Organic & natural" positioning on Persian rice |
| [Amazon](https://www.amazon.com/persian-rice/s?k=persian+rice) | Marketplace | Baseline price/availability reference for diaspora buyers |

### 2.2 Global rice brands worth copying structurally

- **[Lundberg Family Farms](https://www.lundberg.com/)** — the best-in-class D2C reference: 17+ organic varieties, farm-direct ordering, Regenerative Organic Certification as the trust story, and a [bulk 25 lb collection](https://www.lundberg.com/collections/bulk-rice) sold alongside retail packs. Catalog is faceted by variety and certification, not by brand.
- **[Tilda](https://tilda.com/) (UK)** — aroma/long-grain basmati positioning, mostly retail-distributed rather than D2C.
- **Kokuho Rose** — premium single-purpose positioning (short grain for sushi); proof that a narrow varietal story sustains a premium.
- **[LT Foods / Daawat](https://ltfoods.com/)** — the scaled multi-brand, multi-market operator; relevant if Irice ever runs several brands off one catalog.

### 2.3 The gap

None of the Iranian specialists appear to run a **subscription / recurring delivery** model, and none expose **harvest-year or lot-level traceability** as structured data — they assert provenance in prose. Lundberg shows the global template for certified, traceable, farm-direct selling; the Iranian market shows the demand signals (provenance anxiety, high ticket price, installments). Irice's opening is the intersection: **lot-traceable rice, sold per-kg with transparent price history, on a recurring household subscription.**

## 3. Compliance and infrastructure facts for the Iranian build

- **eNamad** (نماد اعتماد الکترونیکی) from the [Iran Center for e-Commerce Development](https://www.ecommerce.gov.ir/) is the de facto trust seal; ~9,000 shops carry it. Plan for the domain/registration requirements early — it gates consumer trust and some gateway onboarding.
- **Payments**: [ZarinPal](https://www.zarinpal.com/) is the standard PSP/aggregator over Shaparak; expect redirect-based IPG with verify callback, not card-on-file.
- **SMS/OTP**: Kavenegar (or equivalent) is the conventional choice for phone-number authentication and order notifications.
- Online share of Iranian retail is projected at 5–10% for 2026 ([ECDB](https://ecdb.com/resources/sample-data/market/ir/all)) — a growing but still small channel, which argues for a marketplace presence (Digikala/Snapp/Okala) *alongside* the D2C site rather than instead of it.
