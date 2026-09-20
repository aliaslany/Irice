/**
 * Messages and locale.
 *
 * fa-IR is the primary locale and the default. The `en` catalog is a stub kept
 * structurally identical so the export/diaspora storefront (see
 * docs/ARCHITECTURE.md §6 phase 5) is a translation job, not a refactor.
 *
 * `Messages` is derived from the fa catalog, so adding a key without
 * translating it is a type error rather than a runtime `undefined`.
 */

export const LOCALES = ["fa", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fa";

const fa = {
  "common.currency": "تومان",
  "common.addToCart": "افزودن به سبد",
  "common.buyNow": "خرید",
  "catalog.varieties": "انواع برنج",
  "catalog.origin": "خاستگاه",
  "catalog.harvestYear": "سال برداشت",
  "catalog.freshCrop": "برنج تازه (کشت امسال)",
  "catalog.agedCrop": "برنج کهنه",
  "catalog.grade": "درجه",
  "catalog.pricePerKg": "قیمت هر کیلوگرم",
  "catalog.packSize": "وزن بسته",
  "catalog.lotCode": "کد محموله",
  "catalog.traceability": "شناسنامه محموله",
  "catalog.outOfStock": "ناموجود",
  "cart.empty": "سبد خرید شما خالی است.",
  "cart.total": "مجموع",
  "cart.shipping": "هزینه ارسال",
  "cart.freeShipping": "ارسال رایگان",
  "checkout.payOnline": "پرداخت اینترنتی",
  "checkout.installments": "خرید اقساطی",
  "trust.returnGuarantee": "ضمانت بازگشت کالا تا ۱۰ روز پس از تحویل",
  "trust.millDirect": "ارسال مستقیم از کارخانه، بدون واسطه",
  "trust.labCertificate": "گواهی آزمایشگاهی",
} as const;

export type MessageKey = keyof typeof fa;
export type Messages = Record<MessageKey, string>;

/** Stub: English copy falls back to the Persian key set until phase 5. */
const en: Partial<Messages> = {
  "common.currency": "IRT",
  "common.addToCart": "Add to cart",
  "catalog.harvestYear": "Harvest year",
  "catalog.traceability": "Lot passport",
};

const CATALOGS: Record<Locale, Partial<Messages>> = { fa, en };

/** Look up a message, falling back to fa-IR for untranslated keys. */
export function t(key: MessageKey, locale: Locale = DEFAULT_LOCALE): string {
  return CATALOGS[locale][key] ?? fa[key];
}

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
