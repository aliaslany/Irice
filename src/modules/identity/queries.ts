/**
 * Identity persistence: OTP request/verify and customer lookup.
 *
 * This is the only module that writes otp_codes or reads/creates customers,
 * so the "how many requests per minute" and "how many guesses per code"
 * limits live in exactly one place.
 */
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { customers, otpCodes, type Customer } from "../../db/schema/index";
import { loadEnv } from "../../globals/config";
import { normalizeMobile } from "../../globals/digits";
import { DomainError } from "../../globals/errors";
import { generateOtpCode, hashOtpCode, OTP_MAX_ATTEMPTS, otpExpiresAt } from "./otp";
import type { SmsSender } from "./sms";

/** Requests per mobile number in the trailing window, before rate-limiting kicks in. */
const OTP_REQUEST_LIMIT = 3;
const OTP_REQUEST_WINDOW_MS = 10 * 60 * 1000;

/**
 * Issue a new OTP, after checking the request isn't a validation error or a
 * flood. Returns nothing sensitive — the code goes out over `sms`, never in
 * a return value a client script could read.
 */
export async function requestOtp(rawMobile: string, sms: SmsSender): Promise<void> {
  const mobile = normalizeMobile(rawMobile);
  if (!mobile) {
    throw new DomainError("VALIDATION", "invalid Iranian mobile number", { rawMobile });
  }

  const windowStart = new Date(Date.now() - OTP_REQUEST_WINDOW_MS);
  const recent = await db
    .select({ count: sql<string>`count(*)` })
    .from(otpCodes)
    .where(and(eq(otpCodes.mobile, mobile), gt(otpCodes.createdAt, windowStart)));
  if (Number(recent[0]?.count ?? 0) >= OTP_REQUEST_LIMIT) {
    throw new DomainError("RATE_LIMITED", "too many OTP requests for this mobile", { mobile });
  }

  const code = generateOtpCode();
  await db.insert(otpCodes).values({
    mobile,
    codeHash: hashOtpCode(code),
    expiresAt: otpExpiresAt(),
    // See otp_codes.dev_plaintext_code — only ever populated when an
    // operator has explicitly opted in, never on a real deployment.
    devPlaintextCode: loadEnv().ALLOW_DEV_OTP_PEEK ? code : null,
  });
  await sms.sendOtp(mobile, code);
}

/**
 * Dev/staging-only readback of the active code for a mobile number, for
 * GET /api/dev/last-otp. Reads the database rather than in-process memory —
 * see the schema comment on why that's the part that actually has to work
 * across Next's separately-bundled Server Actions and Route Handlers.
 */
export async function devPeekOtp(rawMobile: string): Promise<string | null> {
  if (!loadEnv().ALLOW_DEV_OTP_PEEK) return null;
  const mobile = normalizeMobile(rawMobile);
  if (!mobile) return null;

  const [pending] = await db
    .select({ code: otpCodes.devPlaintextCode })
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.mobile, mobile),
        isNull(otpCodes.consumedAt),
        gt(otpCodes.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);
  return pending?.code ?? null;
}

type VerifyOutcome =
  | { kind: "no-otp" }
  | { kind: "rate-limited" }
  | { kind: "wrong-code" }
  | { kind: "ok"; customer: Customer };

/**
 * Verify a code and return the customer, creating one on first login.
 * Consumes the code so it cannot be replayed, and counts a wrong guess
 * against the attempt limit before checking the code, so a client that
 * retries after every failure can't bypass the cap.
 *
 * The transaction below always commits — even on a wrong guess — and the
 * DomainError is thrown OUTSIDE it, from the returned outcome. Throwing from
 * inside `db.transaction()`'s callback rolls back every write the callback
 * made, which would silently erase the very `attempts + 1` write meant to
 * persist through a rejected guess: attempt limiting would then never
 * trigger, because a wrong code would forever reset its own counter to zero
 * on the way out.
 */
export async function verifyOtp(rawMobile: string, code: string): Promise<Customer> {
  const mobile = normalizeMobile(rawMobile);
  if (!mobile) {
    throw new DomainError("VALIDATION", "invalid Iranian mobile number", { rawMobile });
  }

  const outcome = await db.transaction<VerifyOutcome>(async (tx) => {
    const [pending] = await tx
      .select()
      .from(otpCodes)
      .where(
        and(
          eq(otpCodes.mobile, mobile),
          isNull(otpCodes.consumedAt),
          gt(otpCodes.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(otpCodes.createdAt))
      .limit(1)
      .for("update");

    if (!pending) return { kind: "no-otp" };
    if (pending.attempts >= OTP_MAX_ATTEMPTS) return { kind: "rate-limited" };

    const hash = hashOtpCode(code);
    if (hash !== pending.codeHash) {
      await tx
        .update(otpCodes)
        .set({ attempts: sql`${otpCodes.attempts} + 1` })
        .where(eq(otpCodes.id, pending.id));
      return { kind: "wrong-code" };
    }

    await tx.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, pending.id));

    const [existing] = await tx.select().from(customers).where(eq(customers.mobile, mobile));
    if (existing) return { kind: "ok", customer: existing };

    const [created] = await tx.insert(customers).values({ mobile }).returning();
    if (!created) throw new Error("failed to create customer"); // genuine anomaly — rollback is correct here
    return { kind: "ok", customer: created };
  });

  switch (outcome.kind) {
    case "no-otp":
      throw new DomainError("VALIDATION", "no active OTP for this mobile", { mobile });
    case "rate-limited":
      throw new DomainError("RATE_LIMITED", "too many attempts on this code", { mobile });
    case "wrong-code":
      throw new DomainError("VALIDATION", "incorrect code", { mobile });
    case "ok":
      return outcome.customer;
  }
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  const [row] = await db.select().from(customers).where(eq(customers.id, id));
  return row ?? null;
}
