/**
 * The payment gateway's redirect target — the same route ZarinPal and our
 * fake gateway both send the browser back to.
 *
 * The `Status`/`Authority` query params are the GATEWAY'S redirect hint, not
 * proof of payment: anyone can craft a GET to this URL with `Status=OK` and
 * an authority they don't own. The only thing that decides success is
 * `verifyPayment` calling the gateway back server-to-server — the query
 * string here is never trusted for the outcome, only used to find which
 * authority to verify.
 */
import { NextResponse } from "next/server";
import { loadEnv } from "../../../globals/config";
import { verifyPayment } from "../../../modules/checkout/checkout";

export async function GET(request: Request): Promise<NextResponse> {
  const env = loadEnv();
  // Redirect targets are built from the configured SITE_URL, never from
  // `request.url`'s host: Next's Route Handlers report that host as
  // whatever the server itself binds to (observed as "localhost" here even
  // when reached via 127.0.0.1), not necessarily the hostname the browser
  // is actually on. A mismatch there sends the browser to a different
  // origin than the one holding the session/cart cookies — same loopback
  // address, but a different cookie jar as far as the browser is concerned.
  const authority = new URL(request.url).searchParams.get("Authority");
  if (!authority) {
    return NextResponse.redirect(new URL("/cart", env.SITE_URL));
  }

  const result = await verifyPayment(authority, env.SITE_URL);

  const params = new URLSearchParams();
  if (result.reward) {
    params.set("pointsEarned", String(result.reward.pointsEarned));
    if (result.reward.newBadges.length > 0) {
      params.set("newBadges", result.reward.newBadges.map((b) => b.code).join(","));
    }
  }
  const query = params.toString();
  return NextResponse.redirect(new URL(`/orders/${result.orderId}${query ? `?${query}` : ""}`, env.SITE_URL));
}
