import type { Metadata } from "next";
import { listVarietyCards } from "../modules/catalog/queries";
import { HarvestBadge, Price } from "../components/primitives";

/**
 * Catalog data changes when an operator edits a lot price, which is a
 * deliberate, low-frequency act — five minutes of staleness is a fair trade
 * for serving most crawls and most visitors from cache.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "خرید برنج ایرانی درجه یک، مستقیم از کارخانه",
  description:
    "انواع برنج ایرانی — هاشمی، طارم، دمسیاه، صدری — با شناسنامه محموله: خاستگاه، سال برداشت و قیمت شفاف هر کیلوگرم.",
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const cards = await listVarietyCards();

  return (
    <>
      <section className="mb-10">
        <h1 className="text-3xl font-bold">برنج ایرانی، با شناسنامه</h1>
        <p className="mt-3 max-w-2xl text-muted">
          هر کیسه از یک محموله مشخص بسته‌بندی می‌شود: یک شالیزار، یک سال برداشت، یک نوبت
          کارخانه. قیمت هر کیلوگرم شفاف است و می‌توانید سابقه‌اش را ببینید.
        </p>
      </section>

      <h2 className="mb-4 text-xl font-semibold">{`انواع برنج`}</h2>

      {cards.length === 0 ? (
        <p className="text-muted">هنوز محصولی منتشر نشده است.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(({ variety, fromPricePerKgRial, latestHarvestYear, inStock }) => (
            <li key={variety.id} className="h-full">
              {/* flex column + mt-auto on the price: cards in a row end up the
                  same height and their prices align, whatever the summary length. */}
              <a
                href={`/rice/${variety.slug}`}
                className="flex h-full flex-col rounded-lg border border-line bg-surface p-5 shadow-[var(--shadow-card)] transition hover:border-brand"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold">{variety.nameFa}</h3>
                  {latestHarvestYear !== null && <HarvestBadge harvestYear={latestHarvestYear} />}
                </div>

                {variety.summaryFa && (
                  <p className="mt-2 line-clamp-3 text-sm text-muted">{variety.summaryFa}</p>
                )}

                <div className="mt-auto pt-4 text-sm">
                  {inStock && fromPricePerKgRial !== null ? (
                    <span>
                      از <Price amountRial={fromPricePerKgRial} className="font-semibold" /> هر
                      کیلوگرم
                    </span>
                  ) : (
                    <span className="text-danger">ناموجود</span>
                  )}
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
