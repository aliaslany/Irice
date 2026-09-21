/**
 * Dev/staging-only readback of the last OTP sent to a mobile number.
 *
 * Disabled unless ALLOW_DEV_OTP_PEEK is explicitly set — see the comment on
 * that flag in globals/config.ts. This exists purely so the e2e test (and a
 * developer without an SMS provider configured) can complete a login
 * without reading server logs.
 */
import { NextResponse } from "next/server";
import { loadEnv } from "../../../../globals/config";
import { devPeekOtp } from "../../../../modules/identity/queries";

export async function GET(request: Request): Promise<NextResponse> {
  if (!loadEnv().ALLOW_DEV_OTP_PEEK) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const mobile = new URL(request.url).searchParams.get("mobile");
  if (!mobile) return NextResponse.json({ error: "mobile query param required" }, { status: 400 });

  const code = await devPeekOtp(mobile);
  if (!code) return NextResponse.json({ error: "no code on record" }, { status: 404 });
  return NextResponse.json({ code });
}
