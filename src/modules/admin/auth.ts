/**
 * The admin surface's whole authentication model: one shared token.
 *
 * This is a deliberate, documented stopgap, not a design choice to build on.
 * Real admin work — approving a return, uploading a lab certificate — has
 * exactly one operator today, so a single shared credential is honest about
 * where the project actually is; it is NOT what a second hire should still
 * be using. The moment there's more than one person touching this surface,
 * it needs real accounts, roles, and an audit trail of *who* approved what,
 * none of which a shared token can provide. Tracked as the first item phase
 * 4 should pick up — see docs/ARCHITECTURE.md.
 */
import { timingSafeEqual } from "node:crypto";

/** Constant-time comparison — the whole point of a shared secret is that guessing it must not get easier by timing how fast "wrong" comes back. */
export function isValidAdminToken(candidate: string, expected: string): boolean {
  const candidateBuf = Buffer.from(candidate);
  const expectedBuf = Buffer.from(expected);
  if (candidateBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(candidateBuf, expectedBuf);
}
