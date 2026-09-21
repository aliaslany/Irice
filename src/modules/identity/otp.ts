/**
 * OTP codes.
 *
 * Pure crypto/formatting; storage and attempt-limiting live in queries.ts,
 * which is the only place that touches the database. The code itself is
 * never persisted — only its hash — so a database read can't leak a login
 * code that's still valid.
 */
import { createHash, randomInt } from "node:crypto";

export const OTP_LENGTH = 5;
export const OTP_TTL_SECONDS = 120;
export const OTP_MAX_ATTEMPTS = 5;

/** A 5-digit numeric code — Kavenegar and every Iranian OTP SMS use this shape. */
export function generateOtpCode(): string {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

export function hashOtpCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function verifyOtpHash(code: string, hash: string): boolean {
  return hashOtpCode(code) === hash;
}

export function otpExpiresAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + OTP_TTL_SECONDS * 1000);
}
