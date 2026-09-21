/**
 * Reading the current visitor's identity and cart from cookies.
 *
 * Read-only — safe to call from any Server Component. Only Server Actions
 * may create a cart or set a cookie (see _actions/cart-actions.ts): a page
 * view alone must never write to the database, or every anonymous visit
 * would leave behind an empty cart row.
 */
import { cookies } from "next/headers";
import type { Customer } from "../../db/schema/index";
import { loadEnv } from "../../globals/config";
import { computeCartTotals } from "../../modules/cart/cart";
import { getOrCreateCartByToken, listCartItems, resolveCartLines } from "../../modules/cart/queries";
import { getCustomerById } from "../../modules/identity/queries";
import { createSessionToken, SESSION_TTL_SECONDS, verifySessionToken } from "../../modules/identity/session";

export const SESSION_COOKIE = "irice_session";
export const CART_COOKIE = "irice_cart";

/**
 * Whether cookies should be marked `Secure`, decided from SITE_URL's actual
 * protocol rather than NODE_ENV. `next start` always sets NODE_ENV=production
 * regardless of environment — the same fact that governs ALLOW_DEV_OTP_PEEK
 * elsewhere — so a `secure` default keyed off it would mark the session
 * cookie Secure even when serving plain http:// (this environment, local
 * dev, or a plain-HTTP CI/staging run), and a browser silently refuses to
 * send a Secure cookie back over a non-HTTPS connection. The login would
 * appear to succeed — the cookie gets set — and then silently vanish on the
 * very next request.
 */
function secureCookies(): boolean {
  return loadEnv().SITE_URL.startsWith("https://");
}

export async function getCurrentCustomer(): Promise<Customer | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const env = loadEnv();
  const verified = verifySessionToken(token, env.SESSION_SECRET!);
  if (!verified) return null;
  return getCustomerById(verified.customerId);
}

/** Cart id, line items, and totals for whoever is browsing — read-only. */
export async function getCartSummary() {
  const store = await cookies();
  const token = store.get(CART_COOKIE)?.value;

  if (!token) {
    return { cartId: null as string | null, lines: [], totals: computeCartTotals([]) };
  }

  const cart = await getOrCreateCartByToken(token);
  const rawItems = await listCartItems(cart.id);
  const lines = await resolveCartLines(rawItems);
  return { cartId: cart.id, lines, totals: computeCartTotals(lines) };
}

/**
 * Write path: get-or-create the visitor's cart and make sure the cookie is
 * set. Only callable from a Server Action or Route Handler context (Next
 * throws if `cookies().set()` runs during a plain page render) — every
 * cart-mutating action calls this first.
 */
export async function ensureCartWithCookie() {
  const store = await cookies();
  const existingToken = store.get(CART_COOKIE)?.value;
  const cart = await getOrCreateCartByToken(existingToken);
  if (!existingToken) {
    store.set(CART_COOKIE, cart.cartToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookies(),
      maxAge: 60 * 60 * 24 * 180,
      path: "/",
    });
  }
  return cart;
}

export async function setSessionCookie(customerId: string): Promise<void> {
  const env = loadEnv();
  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(customerId, env.SESSION_SECRET!), {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
