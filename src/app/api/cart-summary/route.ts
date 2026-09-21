/**
 * A tiny JSON endpoint so the header's cart badge and login link can be
 * client-fetched instead of read from cookies in the root layout.
 *
 * Reading cookies() anywhere in the shared layout would force every route in
 * the app into per-request dynamic rendering — Next's dynamic APIs bubble
 * dynamism up to the whole page tree in the stable (non-PPR) model, which
 * would erase the ISR/static wins phase 1 built for the variety index and
 * product pages. Fetching this from a small client island instead keeps the
 * page shell static while the personalised bits fill in after hydration.
 */
import { NextResponse } from "next/server";
import { getCartSummary, getCurrentCustomer } from "../../lib/session";

export async function GET(): Promise<NextResponse> {
  const [{ totals }, customer] = await Promise.all([getCartSummary(), getCurrentCustomer()]);
  return NextResponse.json({
    itemCount: totals.itemCount,
    isLoggedIn: customer !== null,
  });
}
