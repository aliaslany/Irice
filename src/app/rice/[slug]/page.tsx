import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getVarietyBySlug } from "../../../modules/catalog/queries";
import { derivePrice } from "../../../modules/pricing/price";
import { rial } from "../../../globals/money";
import { grams } from "../../../globals/weight";
import { toPersianDigits } from "../../../globals/digits";
import { Field, HarvestBadge, LotCode, Price, Weight, gradeLabel } from "../../../components/primitives";
import { addToCartAction } from "../../_actions/cart-actions";
import { formatJalali } from "../../../globals/date";
import { canReview, getVarietyReviewSummary, listVarietyReviews } from "../../../modules/reviews/reviews";
import {
  breadcrumbLd,
  grainTypeLabel,
  OPEN_GRAPH_BASE,
  productLd,
  varietyKeywords,
  withinMetaLength,
} from "../../../modules/seo/structured-data";
import { JsonLd } from "../../../components/JsonLd";
import { getCurrentCustomer } from "../../lib/session";
import { ReviewForm } from "./ReviewForm";

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
  const originDetail = origin
    ? `${variety.nameFa} از ${origin.originCity}، برداشت ${toPersianDigits(String(origin.harvestYear))}، با شناسنامه محموله.`
    : null;
  const description = variety.summaryFa
    ? originDetail
      ? withinMetaLength(variety.summaryFa, originDetail)
      : variety.summaryFa
    : (originDetail ?? `${variety.nameFa} — برنج ایرانی درجه یک.`);
  const title = `خرید برنج ${variety.nameFa}`;

  return {
    title,
    description,
    keywords: varietyKeywords(variety, [...new Set(lots.map(({ lot }) => lot.originProvince))]),
    alternates: { canonical: `/rice/${variety.slug}` },
    openGraph: {
      ...OPEN_GRAPH_BASE,
      title,
      description,
      url: `/rice/${variety.slug}`,
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

  const [reviewSummary, reviewList, customer] = await Promise.all([
    getVarietyReviewSummary(variety.id),
    listVarietyReviews(variety.id),
    getCurrentCustomer(),
  ]);
  const canSubmitReview = customer ? await canReview(customer.id, variety.id) : false;

  const attributes = Object.entries(variety.attributes ?? {});
  const descriptionParagraphs = (variety.descriptionFa ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <>
      <JsonLd data={productLd({ siteUrl: SITE_URL, variety, lots, reviewSummary, reviews: reviewList })} />
      <JsonLd
        data={breadcrumbLd(SITE_URL, [
          { name: "انواع برنج", path: "/" },
          { name: variety.nameFa, path: `/rice/${variety.slug}` },
        ])}
      />

      <nav aria-label="مسیر صفحه" className="mb-6 text-sm text-muted">
        <a href="/" className="hover:text-brand">
          انواع برنج
        </a>
        <span className="px-2">/</span>
        <span aria-current="page">{variety.nameFa}</span>
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

      {(descriptionParagraphs.length > 0 || attributes.length > 0) && (
        <section className="mb-8 rounded-lg border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
          <h2 className="mb-4 text-lg font-semibold">درباره برنج {variety.nameFa}</h2>
          {descriptionParagraphs.map((paragraph, i) => (
            <p key={i} className="mb-3 max-w-3xl leading-[var(--leading-fa)] text-ink last:mb-0">
              {paragraph}
            </p>
          ))}
          {attributes.length > 0 && (
            <>
              <h3 className="mt-6 mb-3 text-sm font-semibold text-muted">ویژگی‌ها</h3>
              <dl className="flex flex-wrap gap-2">
                <div className="rounded-full bg-surface-sunken px-3 py-1 text-sm">
                  <dt className="inline text-muted">نوع دانه: </dt>
                  <dd className="inline font-medium">{grainTypeLabel(variety.grainType)}</dd>
                </div>
                {attributes.map(([name, value]) => (
                  <div key={name} className="rounded-full bg-surface-sunken px-3 py-1 text-sm">
                    <dt className="inline text-muted">{name}: </dt>
                    <dd className="inline font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
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

      <section className="mb-8 rounded-lg border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">نظر خریداران</h2>
          {reviewSummary.reviewCount > 0 && (
            <p className="text-sm text-muted">
              <span className="tabular font-semibold text-ink">
                {toPersianDigits(reviewSummary.averageRating!.toFixed(1))}
              </span>{" "}
              از ۵ · {toPersianDigits(String(reviewSummary.reviewCount))} نظر
            </p>
          )}
        </div>

        {canSubmitReview && (
          <div className="mb-6">
            <ReviewForm varietyId={variety.id} varietySlug={variety.slug} />
          </div>
        )}

        {reviewList.length === 0 ? (
          <p className="text-sm text-muted">هنوز نظری برای این محصول ثبت نشده است.</p>
        ) : (
          <ul className="space-y-4">
            {reviewList.map((review) => (
              <li key={review.id} className="border-b border-line pb-4 last:border-b-0">
                <div className="flex items-center justify-between gap-2">
                  <span dir="ltr" className="text-accent" aria-label={`${toPersianDigits(String(review.rating))} از ۵ ستاره`}>
                    {"★".repeat(review.rating)}
                    <span className="text-line">{"★".repeat(5 - review.rating)}</span>
                  </span>
                  <span className="text-xs text-muted">{formatJalali(review.createdAt)}</span>
                </div>
                <p className="mt-1 text-sm font-medium">{review.reviewerName}</p>
                {review.comment && <p className="mt-1 text-sm text-muted">{review.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
