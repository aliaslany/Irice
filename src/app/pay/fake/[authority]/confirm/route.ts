/**
 * Records the fake gateway's outcome and hands off to the real callback —
 * as a GET, not a Server Action POST.
 *
 * The fake gateway's buttons used to be `<form action={serverAction}>`, and
 * that server action called `redirect()` into `/pay/callback`, which itself
 * redirects into `/orders/[id]`. That is a POST that triggers a same-app
 * redirect chain, and Chromium's SameSite=Lax cookie policy has a real,
 * observed edge case there: cookies were silently dropped on the final hop
 * of that chain, landing on the order page logged out. A real gateway
 * (ZarinPal) never produces this shape — it redirects the browser to
 * /pay/callback with a plain GET from an external origin, which is exactly
 * what this route now simulates instead of a form POST from our own page.
 */
import { NextResponse } from "next/server";
import { loadEnv } from "../../../../../globals/config";
import { recordFakeOutcome } from "../../../../../modules/payments";

export async function GET(request: Request, { params }: { params: Promise<{ authority: string }> }): Promise<NextResponse> {
  const { authority } = await params;
  const outcome = new URL(request.url).searchParams.get("outcome");
  await recordFakeOutcome(authority, outcome === "success" ? "success" : "failure");

  const env = loadEnv();
  const status = outcome === "success" ? "OK" : "NOK";
  return NextResponse.redirect(
    new URL(`/pay/callback?Authority=${encodeURIComponent(authority)}&Status=${status}`, env.SITE_URL),
  );
}
