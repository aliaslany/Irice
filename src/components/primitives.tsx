/**
 * The handful of presentational pieces every catalog page shares.
 *
 * Formatting always goes through the globals layer — a price is never rendered
 * with `toLocaleString` at a call site, because that is how Latin digits and
 * stray decimals leak into a Persian page.
 */
import { formatMoney, rial } from "../globals/money";
import { formatWeight, grams } from "../globals/weight";
import { harvestAge } from "../globals/date";
import { toPersianDigits } from "../globals/digits";

export function Price({
  amountRial,
  unit = "toman",
  className = "",
}: {
  amountRial: number;
  unit?: "toman" | "rial";
  className?: string;
}) {
  return (
    <span className={`tabular ${className}`}>{formatMoney(rial(amountRial), { unit })}</span>
  );
}

export function Weight({ valueG, className = "" }: { valueG: number; className?: string }) {
  return <span className={`tabular ${className}`}>{formatWeight(grams(valueG))}</span>;
}

/** A lot code is Latin inside RTL text and must not be reordered by bidi. */
export function LotCode({ code }: { code: string }) {
  return <code className="ltr-run rounded-sm bg-surface-sunken px-1.5 py-0.5 text-sm">{code}</code>;
}

/**
 * Harvest freshness. Buyers reason in "this year's crop" vs "last year's",
 * not in absolute years, so lead with the age and keep the year as detail.
 */
export function HarvestBadge({ harvestYear, now }: { harvestYear: number; now?: Date }) {
  const age = harvestAge(harvestYear, now);
  const label = age <= 0 ? "کشت امسال" : age === 1 ? "کشت پارسال" : `${toPersianDigits(String(age))} سال کهنه`;
  const tone =
    age <= 0 ? "bg-success/12 text-success" : age === 1 ? "bg-accent/15 text-accent" : "bg-surface-sunken text-muted";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${tone}`}>
      <span>{label}</span>
      <span className="tabular opacity-70">({toPersianDigits(String(harvestYear))})</span>
    </span>
  );
}

const GRADE_FA: Record<string, string> = {
  momtaz: "ممتاز",
  darajeh_yek: "درجه یک",
  darajeh_do: "درجه دو",
  daneh_shekasteh: "دانه شکسته",
};

export function gradeLabel(grade: string): string {
  return GRADE_FA[grade] ?? grade;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line py-3 last:border-b-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 font-medium">{children}</dd>
    </div>
  );
}
