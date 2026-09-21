/**
 * Loyalty tiers, by cumulative kilograms purchased across all paid orders.
 *
 * A weight threshold rather than a rial-spend threshold on purpose: rial
 * thresholds drift with the price of rice (see docs/MARKET-REVIEW.md on how
 * fast prices move), which would silently promote or demote everyone every
 * time a lot's price changed. A kilogram is a kilogram regardless of harvest.
 */
export type LoyaltyTier = "none" | "bronze" | "silver" | "gold" | "diamond";

export const TIER_THRESHOLD_KG: Record<Exclude<LoyaltyTier, "none">, number> = {
  bronze: 10,
  silver: 50,
  gold: 150,
  diamond: 400,
};

const TIER_LABEL_FA: Record<LoyaltyTier, string> = {
  none: "بدون رده",
  bronze: "برنزی",
  silver: "نقره‌ای",
  gold: "طلایی",
  diamond: "الماسی",
};

export function tierLabelFa(tier: LoyaltyTier): string {
  return TIER_LABEL_FA[tier];
}

export function computeTier(totalKg: number): LoyaltyTier {
  if (totalKg >= TIER_THRESHOLD_KG.diamond) return "diamond";
  if (totalKg >= TIER_THRESHOLD_KG.gold) return "gold";
  if (totalKg >= TIER_THRESHOLD_KG.silver) return "silver";
  if (totalKg >= TIER_THRESHOLD_KG.bronze) return "bronze";
  return "none";
}

/** Kilograms still needed to reach the next tier, or null if already at the top. */
export function kgToNextTier(totalKg: number): { nextTier: LoyaltyTier; remainingKg: number } | null {
  const order: Exclude<LoyaltyTier, "none">[] = ["bronze", "silver", "gold", "diamond"];
  for (const tier of order) {
    if (totalKg < TIER_THRESHOLD_KG[tier]) {
      return { nextTier: tier, remainingKg: TIER_THRESHOLD_KG[tier] - totalKg };
    }
  }
  return null;
}
