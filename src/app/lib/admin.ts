/**
 * The admin session cookie — see modules/admin/auth.ts for why this is one
 * shared token rather than real accounts.
 *
 * Reuses identity/session.ts's signed-token primitives with a fixed subject
 * ("admin") and ADMIN_TOKEN itself as the signing secret, rather than
 * inventing a second cookie-signing scheme: the token already has to be a
 * secret only the operator knows, so using it to sign a short-lived session
 * cookie is the same trust assumption a password-based login makes, not a
 * new one.
 */
import { cookies } from "next/headers";
import { loadEnv } from "../../globals/config";
import { createSessionToken, verifySessionToken } from "../../modules/identity/session";

export const ADMIN_COOKIE = "irice_admin";
const ADMIN_SUBJECT = "admin";
/** Deliberately shorter than a customer session — this cookie is worth more. */
const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 8;

function secureCookies(): boolean {
  return loadEnv().SITE_URL.startsWith("https://");
}

export async function getIsAdmin(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  const env = loadEnv();
  const verified = verifySessionToken(token, env.ADMIN_TOKEN);
  return verified?.customerId === ADMIN_SUBJECT;
}

/** Only callable from a Server Action or Route Handler — see ensureCartWithCookie's comment. */
export async function setAdminCookie(): Promise<void> {
  const env = loadEnv();
  const store = await cookies();
  const token = createSessionToken(ADMIN_SUBJECT, env.ADMIN_TOKEN, new Date(), ADMIN_SESSION_TTL_SECONDS);
  store.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    maxAge: ADMIN_SESSION_TTL_SECONDS,
    path: "/",
  });
}

export async function clearAdminCookie(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}
