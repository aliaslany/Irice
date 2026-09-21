/**
 * The 10-day return guarantee's eligibility rule.
 *
 * Pure. The window runs from `fulfilledAt`, the closest fact this system has
 * to "delivered" — see the schema comment on orders.fulfilled_at for why
 * that's a stand-in rather than a real carrier delivery event. An order that
 * was never marked fulfilled is not eligible: there is nothing to return yet.
 */

export const RETURN_WINDOW_DAYS = 10;

export interface ReturnEligibility {
  eligible: boolean;
  /** Present only when ineligible — the reason to show the customer. */
  reasonFa?: string;
}

export function checkReturnEligibility(
  order: { status: string; fulfilledAt: Date | null },
  hasOpenRequest: boolean,
  now: Date = new Date(),
): ReturnEligibility {
  if (hasOpenRequest) {
    return { eligible: false, reasonFa: "برای این سفارش پیش‌تر درخواست مرجوعی ثبت شده است." };
  }
  if (order.status === "returned") {
    return { eligible: false, reasonFa: "این سفارش قبلاً مرجوع شده است." };
  }
  if (order.status !== "fulfilled" || !order.fulfilledAt) {
    return { eligible: false, reasonFa: "این سفارش هنوز تحویل داده نشده است." };
  }

  const deadline = new Date(order.fulfilledAt.getTime() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  if (now > deadline) {
    return { eligible: false, reasonFa: "مهلت ۱۰ روزه بازگشت کالا برای این سفارش به پایان رسیده است." };
  }

  return { eligible: true };
}
