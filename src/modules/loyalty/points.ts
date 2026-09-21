/**
 * Loyalty points.
 *
 * Pure. The ledger this feeds (loyalty_ledger) is append-only, the same
 * pattern as stock_movements: a disputed balance is answered by replaying
 * rows, not by trusting `customers.points_balance_cache`.
 *
 * Rates are conservative on purpose — points are a real discount, and an
 * over-generous scheme against a commodity with thin margins is a fast way
 * to lose money quietly. 1 point per 20,000 rial spent; 1 point redeems for
 * 500 rial (a 2.5% effective loyalty rate), capped at 30% of the order so a
 * points balance can never zero out an order's price.
 */
import { mulRatioRial, rial, subRial, type Rial } from "../../globals/money";

export const POINTS_EARN_RIAL_PER_POINT = 20_000;
export const POINTS_REDEEM_RIAL_PER_POINT = 500;
export const MAX_REDEMPTION_SHARE = 0.3;

/** Points earned on a paid order's subtotal (shipping is never pointable). */
export function pointsForOrder(subtotalRial: Rial): number {
  return Math.floor(subtotalRial / POINTS_EARN_RIAL_PER_POINT);
}

export function redemptionValueRial(points: number): Rial {
  return rial(points * POINTS_REDEEM_RIAL_PER_POINT);
}

/**
 * The most points a customer may redeem against a given subtotal: bounded by
 * their balance, by the 30%-of-subtotal cap, and rounded down to a whole
 * point so the discount never exceeds either bound.
 */
export function maxRedeemablePoints(subtotalRial: Rial, balance: number): number {
  const capRial = Math.floor(subtotalRial * MAX_REDEMPTION_SHARE);
  const capPoints = Math.floor(capRial / POINTS_REDEEM_RIAL_PER_POINT);
  return Math.max(0, Math.min(balance, capPoints));
}

export interface RedemptionResult {
  pointsRedeemed: number;
  discountRial: Rial;
  totalAfterDiscountRial: Rial;
}

/** Clamp a requested redemption to what's actually allowed and apply it. */
export function applyRedemption(
  subtotalRial: Rial,
  balance: number,
  requestedPoints: number,
): RedemptionResult {
  const cap = maxRedeemablePoints(subtotalRial, balance);
  const pointsRedeemed = Math.max(0, Math.min(cap, Math.floor(requestedPoints)));
  const discountRial = redemptionValueRial(pointsRedeemed);
  return {
    pointsRedeemed,
    discountRial,
    totalAfterDiscountRial: subRial(subtotalRial, discountRial),
  };
}
