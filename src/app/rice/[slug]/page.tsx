import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getVarietyBySlug } from "../../../modules/catalog/queries";
import { derivePrice } from "../../../modules/pricing/price";
import { rial } from "../../../globals/money";
import { grams } from "../../../globals/weight";
import { toPersianDigits } from "../../../globals/digits";
import { Field, HarvestBadge, LotCode, Price, Weight, gradeLabel } from "../../../components/primitives";
import { addToCartAction } from "../../_actions/cart-actions";

export const revalidate = 300;

const SITE_URL = process.env.SITE_URL ?? "https://irice.ir";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const detail = await getVarietyBySlug(slug);
  if (!detail) return { title: "یافت نشد" };

  const { variety, lots } = detail;
  const origin = lots[0]?.lot;
  const description =
    variety.summaryFa ??
    (origin
      ? `${variety.nameFa} از ${origin.originCity}، برداشت ${toPersianDigits(String(origin.harvestYear))}، با شناسنامه محموله.`
      : `${variety.nameFa} — برنج ایرانی درجه یک.`);

  return {
    title: `خرید ${variety.nameFa}`,
    description,
    alternates: { canonical: `/rice/${variety.slug}` },
    openGraph: {
      title: `خرید ${variety.nameFa} | آیرایس`,
      description,
      ...(variety.heroImageUrl ? { images: [variety.heroImageUrl] } : {}),
    },
  };
}

export default async function VarietyPage({ params }: PageProps) {
  const { slug } = await params;
  const detail = await getVarietyBySlug(slug);
  if (!detail) notFound();

  const { variety, lots } = detail;
  const lead = lots[0];

  /**
   * Product structured data. `offers` is priced in IRR because schema.org has
   * no Toman currency code — the page displays Toman, the markup states rial,
   * and the two differ by a factor of ten by definition, not by accident.
   */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: variety.nameFa,
    description: variety.summaryFa ?? undefined,
    category: "برنج ایرانی",
    ...(variety.heroImageUrl ? { image: variety.heroImageUrl } : {}),
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
        url: `${SITE_URL}/lot/${lot.code}`,
      })),
    ),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav className="mb-6 text-sm text-muted">
        <a href="/" className="hover:text-brand">
          انواع برنج
        </a>
        <span className="px-2">/</span>
        <span>{variety.nameFa}</span>
      </nav>

      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold">{variety.nameFa}</h1>
          {lead && <HarvestBadge harvestYear={lead.lot.harvestYear} />}
        </div>
        {variety.summaryFa && <p className="mt-3 max-w-2xl text-muted">{variety.summaryFa}</p>}
      </header>

      {lots.length > 0 && (
        <section className="mb-8 rounded-lg border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
          <h2 className="mb-1 text-lg font-semibold">افزودن به سبد</h2>
          <p className="mb-4 text-sm text-muted">
            بسته‌بندی از قدیمی‌ترین محموله موجود ارسال می‌شود (
            <a href={`/lot/${lots[0]!.lot.code}`} className="text-brand hover:underline">
              مشاهده شناسنامه
            </a>
            ).
          </p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(() => {
              // FEFO order matches modules/cart/queries.ts exactly: for each
              // pack size, the price shown is the first (oldest) lot that
              // actively sells it — the same lot checkout will actually cut
              // this pack from if it's the one added.
              const seen = new Set<number>();
              return lots.flatMap(({ lot, skus }) =>
                skus
                  .filter((sku) => {
                    if (seen.has(sku.packSizeG)) return false;
                    seen.add(sku.packSizeG);
                    return true;
                  })
                  .map((sku) => (
                    <li key={sku.id} className="rounded-md border border-line bg-surface-sunken p-4 text-center">
                      <div className="font-semibold">
                        <Weight valueG={sku.packSizeG} />
                      </div>
                      <div className="mt-2 mb-3">
                        <Price amountRial={sku.priceRial} className="font-bold text-brand-strong" />
                      </div>
                      <form action={addToCartAction}>
                        <input type="hidden" name="varietyId" value={variety.id} />
                        <input type="hidden" name="packSizeG" value={sku.packSizeG} />
                        <input type="hidden" name="quantity" value={1} />
                        <button
                          type="submit"
                          className="w-full rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-strong"
                        >
                          افزودن
                        </button>
                      </form>
                    </li>
                  )),
              );
            })()}
          </ul>
        </section>
      )}

      {lots.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface p-6 text-danger">
          در حال حاضر از این نوع برنج محموله‌ای برای فروش نداریم.
        </p>
      ) : (
        lots.map(({ lot, skus }) => (
          <section
            key={lot.id}
            className="mb-8 rounded-lg border border-line bg-surface p-6 shadow-[var(--shadow-card)]"
          >
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-semibold">
                  محموله <LotCode code={lot.code} />
                </h2>
                <HarvestBadge harvestYear={lot.harvestYear} />
              </div>
              <a href={`/lot/${lot.code}`} className="text-sm text-brand hover:underline">
                شناسنامه این محموله ←
              </a>
            </div>

            <dl className="mb-6 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              <Field label="خاستگاه">
                {lot.originCity}، {lot.originProvince}
              </Field>
              <Field label="درجه">{gradeLabel(lot.grade)}</Field>
              <Field label="قیمت هر کیلوگرم">
                <Price amountRial={lot.pricePerKgRial} />
              </Field>
              <Field label="موجودی">
                <Weight valueG={lot.quantityOnHandG - lot.quantityReservedG} />
              </Field>
            </dl>

            <h3 className="mb-3 text-sm font-semibold text-muted">وزن بسته</h3>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {skus.map((sku) => {
                // Shown so the customer can compare pack sizes honestly: the
                // per-kg number includes packaging, unlike the headline price.
                const breakdown = derivePrice({
                  pricePerKgRial: rial(lot.pricePerKgRial),
                  packSizeG: grams(sku.packSizeG),
                  packagingFeeRial: rial(sku.packagingFeeRial),
                });
                return (
                  <li
                    key={sku.id}
                    className="rounded-md border border-line bg-surface-sunken p-4 text-center"
                  >
                    <div className="font-semibold">
                      <Weight valueG={sku.packSizeG} />
                    </div>
                    <div className="mt-2">
                      <Price amountRial={sku.priceRial} className="font-bold text-brand-strong" />
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      هر کیلو <Price amountRial={breakdown.effectivePerKgRial} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
