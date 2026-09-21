/**
 * The Rice Passport badge catalog.
 *
 * Pure. `evaluateBadges` takes a snapshot of a customer's paid-order history
 * and returns every badge code they currently qualify for; the caller
 * (modules/loyalty/apply.ts) diffs that against what's already persisted in
 * `customer_badges` and inserts only the new ones — so a badge, once earned,
 * is never silently revoked by this function running again with the same or
 * more history (every predicate here is monotonic: more purchases can only
 * ever add badges, never remove one).
 *
 * The catalog is intentionally not a DB enum — see the comment on
 * customer_badges — so an operator can add "harvest_streak_24" or a new
 * origin badge as a content change, not a migration.
 */
import { STREAK_BADGE_THRESHOLDS_MONTHS } from "./streak";
import { TIER_THRESHOLD_KG, type LoyaltyTier } from "./tier";

export interface BadgeDefinition {
  code: string;
  labelFa: string;
  descriptionFa: string;
  /** An emoji is enough for a passport stamp; no icon asset pipeline needed. */
  icon: string;
}

const ORDER_COUNT_THRESHOLDS = [5, 10, 25] as const;
const VARIETY_EXPLORER_THRESHOLD = 3;

/** Provinces the catalog currently sources from — see docs/MARKET-REVIEW.md. */
const ORIGIN_BADGE_PROVINCES: Record<string, { code: string; labelFa: string }> = {
  گیلان: { code: "origin_gilan", labelFa: "خاستگاه: گیلان" },
  مازندران: { code: "origin_mazandaran", labelFa: "خاستگاه: مازندران" },
};

const TIER_ORDER: Exclude<LoyaltyTier, "none">[] = ["bronze", "silver", "gold", "diamond"];

export const BADGE_CATALOG: readonly BadgeDefinition[] = [
  {
    code: "first_harvest",
    labelFa: "اولین برداشت",
    descriptionFa: "اولین سفارش پرداخت‌شده شما در آیرایس.",
    icon: "🌾",
  },
  {
    code: "big_bag",
    labelFa: "کیسه بزرگ",
    descriptionFa: "خرید یک کیسه ۲۰ کیلویی.",
    icon: "🛍️",
  },
  {
    code: "variety_explorer",
    labelFa: "کاوشگر برنج",
    descriptionFa: `امتحان کردن ${VARIETY_EXPLORER_THRESHOLD} نوع برنج مختلف.`,
    icon: "🧭",
  },
  {
    code: "variety_explorer_all",
    labelFa: "استاد برنج",
    descriptionFa: "امتحان کردن همه انواع برنج موجود در آیرایس.",
    icon: "👑",
  },
  ...Object.values(ORIGIN_BADGE_PROVINCES).map((p) => ({
    code: p.code,
    labelFa: p.labelFa,
    descriptionFa: `خرید برنجی با خاستگاه ${p.labelFa.split(": ")[1]}.`,
    icon: "📍",
  })),
  ...STREAK_BADGE_THRESHOLDS_MONTHS.map((months) => ({
    code: `harvest_streak_${months}`,
    labelFa: `جریان ${months} ماهه`,
    descriptionFa: `${months} ماه پیاپی خرید از آیرایس.`,
    icon: "🔥",
  })),
  ...ORDER_COUNT_THRESHOLDS.map((n) => ({
    code: `loyal_${n}`,
    labelFa: `مشتری وفادار (${n})`,
    descriptionFa: `${n} سفارش پرداخت‌شده در آیرایس.`,
    icon: "🏅",
  })),
  ...TIER_ORDER.map((tier) => ({
    code: `tier_${tier}`,
    labelFa: `رده ${tier === "bronze" ? "برنزی" : tier === "silver" ? "نقره‌ای" : tier === "gold" ? "طلایی" : "الماسی"}`,
    descriptionFa: `رسیدن به ${TIER_THRESHOLD_KG[tier]} کیلوگرم خرید تجمعی.`,
    icon: tier === "diamond" ? "💎" : tier === "gold" ? "🥇" : tier === "silver" ? "🥈" : "🥉",
  })),
];

const BADGE_BY_CODE = new Map(BADGE_CATALOG.map((b) => [b.code, b]));

export function badgeDefinition(code: string): BadgeDefinition | undefined {
  return BADGE_BY_CODE.get(code);
}

export interface BadgeEvalInput {
  totalPaidOrders: number;
  totalKg: number;
  distinctVarietySlugs: ReadonlySet<string>;
  publishedVarietyCount: number;
  distinctOriginProvinces: ReadonlySet<string>;
  hasBigBag: boolean;
  currentStreakMonths: number;
}

/** Every badge code this history currently qualifies for. */
export function evaluateBadges(input: BadgeEvalInput): Set<string> {
  const earned = new Set<string>();

  if (input.totalPaidOrders >= 1) earned.add("first_harvest");
  if (input.hasBigBag) earned.add("big_bag");

  if (input.distinctVarietySlugs.size >= VARIETY_EXPLORER_THRESHOLD) earned.add("variety_explorer");
  if (
    input.publishedVarietyCount > 0 &&
    input.distinctVarietySlugs.size >= input.publishedVarietyCount
  ) {
    earned.add("variety_explorer_all");
  }

  for (const province of input.distinctOriginProvinces) {
    const badge = ORIGIN_BADGE_PROVINCES[province];
    if (badge) earned.add(badge.code);
  }

  for (const months of STREAK_BADGE_THRESHOLDS_MONTHS) {
    if (input.currentStreakMonths >= months) earned.add(`harvest_streak_${months}`);
  }

  for (const n of ORDER_COUNT_THRESHOLDS) {
    if (input.totalPaidOrders >= n) earned.add(`loyal_${n}`);
  }

  for (const tier of TIER_ORDER) {
    if (input.totalKg >= TIER_THRESHOLD_KG[tier]) earned.add(`tier_${tier}`);
  }

  return earned;
}
