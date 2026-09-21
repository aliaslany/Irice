/**
 * Session tokens.
 *
 * A signed, stateless cookie value: `customerId.expiryMs.signature`. No
 * server-side session table — verifying a token is one HMAC comparison, and
 * revocation (logout) is just deleting the cookie, which is enough for a
 * storefront with no admin-side "kill all sessions" requirement yet.
 *
 * Pure given a secret; the secret itself comes from globals/config.ts.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function createSessionToken(
  customerId: string,
  secret: string,
  now: Date = new Date(),
  ttlSeconds: number = SESSION_TTL_SECONDS,
): string {
  const expiresAtMs = now.getTime() + ttlSeconds * 1000;
  const payload = `${customerId}.${expiresAtMs}`;
  return `${payload}.${sign(payload, secret)}`;
}

export interface VerifiedSession {
  customerId: string;
}

/**
 * Verify a token, checking both the signature and expiry. Returns null for
 * anything malformed, expired, or tampered with — callers treat that
 * identically to "not logged in", never as an error to surface.
 */
export function verifySessionToken(
  token: string | undefined | null,
  secret: string,
  now: Date = new Date(),
): VerifiedSession | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [customerId, expiresAtStr, signature] = parts;
  if (!customerId || !expiresAtStr || !signature) return null;

  const expiresAtMs = Number(expiresAtStr);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < now.getTime()) return null;

  const payload = `${customerId}.${expiresAtStr}`;
  const expected = sign(payload, secret);

  // Constant-time comparison; a login cookie is exactly the kind of secret
  // a timing side-channel on string equality is meant to protect.
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== actualBuf.length) return null;
  if (!timingSafeEqual(expectedBuf, actualBuf)) return null;

  return { customerId };
}
