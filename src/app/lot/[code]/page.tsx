import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLotPassport } from "../../../modules/catalog/queries";
import { priceChangePct } from "../../../modules/pricing/price";
import { formatJalali } from "../../../globals/date";
import { formatPercentFa, toPersianDigits } from "../../../globals/digits";
import { rial } from "../../../globals/money";
import { Field, HarvestBadge, LotCode, Price, Weight, gradeLabel } from "../../../components/primitives";
import { PriceHistoryChart } from "../../../components/PriceHistoryChart";

/** A passport is near-immutable once the lot ships; cache it hard. */
export const revalidate = 3600;

interface PageProps {
  params: Promise<{ code: string }>;
}

const CERT_LABEL_FA: Record<string, string> = {
  lab_analysis: "آزمون آزمایشگاهی",
  origin: "گواهی خاستگاه",
  organic: "گواهی ارگانیک",
  health: "گواهی بهداشت",
};

const CROP_CYCLE_FA: Record<string, string> = {
  first: "کشت اول",
  ratoon: "کشت دوم (راتون)",
};

const STATUS_NOTE_FA: Record<string, string> = {
  incoming: "این محموله هنوز به انبار نرسیده است.",
  active: "این محموله هم‌اکنون در حال فروش است.",
  depleted: "موجودی این محموله به پایان رسیده است.",
  quarantined: "فروش این محموله موقتاً متوقف شده است.",
  archived: "این محموله بایگانی شده است.",
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const passport = await getLotPassport(code);
  if (!passport) return { title: "محموله یافت نشد" };

  const { lot, variety } = passport;
  return {
    title: `شناسنامه محموله ${lot.code}`,
    // Persian digits in the snippet too: a Latin "1405" in a Persian result
    // reads as a foreign string to the people this page is written for.
    description: `${variety.nameFa} از ${lot.originCity}، ${lot.originProvince} — برداشت ${toPersianDigits(String(lot.harvestYear))}، درجه ${gradeLabel(lot.grade)}.`,
    alternates: { canonical: `/lot/${lot.code}` },
    // A passport is a reference page reached by QR, not a search landing page;
    // it should be indexable but never compete with the variety page.
    robots: { index: true, follow: true },
  };
}

export default async function LotPassportPage({ params }: PageProps) {
  const { code } = await params;
  const passport = await getLotPassport(code);
  if (!passport) notFound();

  const { lot, variety, skus, certificates, priceHistory } = passport;
  const first = priceHistory[0];
  const last = priceHistory[priceHistory.length - 1];
  const change =
    first && last && first.id !== last.id
      ? priceChangePct(rial(first.pricePerKgRial), rial(last.pricePerKgRial))
      : null;

  return (
    <>
      <nav className="mb-6 text-sm text-muted">
        <a href="/" className="hover:text-brand">
          انواع برنج
        </a>
        <span className="px-2">/</span>
        <a href={`/rice/${variety.slug}`} className="hover:text-brand">
          {variety.nameFa}
        </a>
        <span className="px-2">/</span>
        <span>شناسنامه محموله</span>
      </nav>

      <header className="mb-8">
        <p className="text-sm text-muted">شناسنامه محموله</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold">
            <LotCode code={lot.code} />
          </h1>
          <HarvestBadge harvestYear={lot.harvestYear} />
        </div>
        <p className="mt-3 text-muted">
          {variety.nameFa} — {STATUS_NOTE_FA[lot.status] ?? ""}
        </p>
      </header>

      <section className="mb-8 rounded-lg border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
        <h2 className="mb-4 text-lg font-semibold">خاستگاه و کیفیت</h2>
        <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
          <Field label="استان">{lot.originProvince}</Field>
          <Field label="شهر / شالیزار">{lot.originCity}</Field>
          {lot.millName && <Field label="کارخانه شالی‌کوبی">{lot.millName}</Field>}
          <Field label="سال برداشت">
            <span className="tabular">{toPersianDigits(String(lot.harvestYear))}</span>
          </Field>
          <Field label="نوبت کشت">{CROP_CYCLE_FA[lot.cropCycle] ?? lot.cropCycle}</Field>
          <Field label="درجه">{gradeLabel(lot.grade)}</Field>
          {lot.moisturePct && (
            <Field label="رطوبت">
              <span className="tabular">{formatPercentFa(lot.moisturePct)}</span>
            </Field>
          )}
          {lot.brokenGrainPct && (
            <Field label="دانه شکسته">
              <span className="tabular">{formatPercentFa(lot.brokenGrainPct)}</span>
            </Field>
          )}
          {lot.receivedAt && <Field label="تاریخ ورود به انبار">{formatJalali(lot.receivedAt)}</Field>}
        </dl>
      </section>

      {certificates.length > 0 && (
        <section className="mb-8 rounded-lg border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
          <h2 className="mb-4 text-lg font-semibold">گواهی‌ها</h2>
          <ul className="space-y-3">
            {certificates.map((cert) => (
              <li key={cert.id} className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="font-medium">{CERT_LABEL_FA[cert.kind] ?? cert.kind}</span>
                  <span className="text-muted"> — {cert.issuer}</span>
                  {cert.referenceNo && (
                    <>
                      {" "}
                      <span className="ltr-run text-sm text-muted">({cert.referenceNo})</span>
                    </>
                  )}
                </div>
                <div className="flex items-baseline gap-3 text-sm">
                  <span className="text-muted">{formatJalali(cert.issuedAt)}</span>
                  <a href={cert.fileUrl} className="text-brand hover:underline">
                    مشاهده
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-8 rounded-lg border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
        <h2 className="mb-1 text-lg font-semibold">سابقه قیمت هر کیلوگرم</h2>
        <p className="mb-4 text-sm text-muted">
          قیمت این محموله از زمان ورود تا امروز. چیزی پنهان نمی‌کنیم.
        </p>

        {priceHistory.length === 0 ? (
          <p className="text-muted">هنوز تغییری ثبت نشده است.</p>
        ) : (
          <>
            {change !== null && (
              <p className="mb-4 text-sm">
                تغییر از اولین ثبت:{" "}
                <span className={change >= 0 ? "text-danger" : "text-success"}>
                  {change >= 0 ? "+" : "−"}
                  {formatPercentFa(Math.abs(change))}
                </span>
              </p>
            )}
            {priceHistory.length > 1 && (
              <div className="mb-6">
                <PriceHistoryChart
                  points={priceHistory.map((entry) => ({
                    id: entry.id,
                    effectiveFromIso: entry.effectiveFrom.toISOString(),
                    pricePerKgRial: entry.pricePerKgRial,
                  }))}
                />
              </div>
            )}
            <ol className="space-y-2">
              {priceHistory.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-baseline justify-between border-b border-line pb-2 last:border-b-0"
                >
                  <span className="text-sm text-muted">{formatJalali(entry.effectiveFrom)}</span>
                  <Price amountRial={entry.pricePerKgRial} className="font-medium" />
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      {skus.length > 0 && (
        <section className="mb-8 rounded-lg border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
          <h2 className="mb-4 text-lg font-semibold">بسته‌بندی‌های این محموله</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {skus.map((sku) => (
              <li key={sku.id} className="rounded-md border border-line bg-surface-sunken p-4 text-center">
                <div className="font-semibold">
                  <Weight valueG={sku.packSizeG} />
                </div>
                <div className="mt-2">
                  <Price amountRial={sku.priceRial} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-sm text-muted">
        <a href={`/rice/${variety.slug}`} className="text-brand hover:underline">
          بازگشت به {variety.nameFa}
        </a>
      </p>
    </>
  );
}
