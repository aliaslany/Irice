/**
 * Integration tests against real Postgres — the request/verify OTP flow and
 * the dev-peek readback that /api/dev/last-otp depends on.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/client";
import { customers, otpCodes } from "../../db/schema/index";
import { DomainError } from "../../globals/errors";
import { resetEnvCache } from "../../globals/config";
import { devPeekOtp, requestOtp, verifyOtp } from "./queries";
import type { SmsSender } from "./sms";

const MOBILE = "09121234567";

class CapturingSmsSender implements SmsSender {
  lastCode: string | undefined;
  async sendOtp(_mobile: string, code: string): Promise<void> {
    this.lastCode = code;
  }
}

async function resetDb(): Promise<void> {
  await db.execute("truncate table otp_codes, customers restart identity cascade");
}

beforeEach(async () => {
  await resetDb();
});

// Leaves the dev database clean after the file's last test, so test
// fixtures ('split-variety', throwaway customers) never linger to
// pollute a manual inspection of the database or, worse, get baked
// into a static page built shortly after the suite runs.
afterAll(async () => {
  await resetDb();
});

describe("requestOtp() / verifyOtp()", () => {
  it("creates a customer on first successful verification", async () => {
    const sms = new CapturingSmsSender();
    await requestOtp(MOBILE, sms);
    expect(sms.lastCode).toMatch(/^\d{5}$/);

    const customer = await verifyOtp(MOBILE, sms.lastCode!);
    expect(customer.mobile).toBe(MOBILE);

    const rows = await db.select().from(customers).where(eq_(customers.mobile, MOBILE));
    expect(rows).toHaveLength(1);
  });

  it("reuses the existing customer on a later login", async () => {
    const sms = new CapturingSmsSender();
    await requestOtp(MOBILE, sms);
    const first = await verifyOtp(MOBILE, sms.lastCode!);

    await requestOtp(MOBILE, sms);
    const second = await verifyOtp(MOBILE, sms.lastCode!);

    expect(second.id).toBe(first.id);
  });

  it("rejects the wrong code and counts it as an attempt", async () => {
    const sms = new CapturingSmsSender();
    await requestOtp(MOBILE, sms);
    await expect(verifyOtp(MOBILE, "00000")).rejects.toThrow(DomainError);

    const [row] = await db.select().from(otpCodes).where(eq_(otpCodes.mobile, MOBILE));
    expect(row?.attempts).toBe(1);
  });

  it("actually locks out after OTP_MAX_ATTEMPTS wrong guesses", async () => {
    // This is the behavior the attempts-persist-through-a-throw fix exists
    // for: without it, a wrong guess's increment was rolled back by the very
    // rejection it caused, so the limit could never be reached.
    const sms = new CapturingSmsSender();
    await requestOtp(MOBILE, sms);

    for (let i = 0; i < 5; i++) {
      await expect(verifyOtp(MOBILE, "00000")).rejects.toThrow(DomainError);
    }

    const [row] = await db.select().from(otpCodes).where(eq_(otpCodes.mobile, MOBILE));
    expect(row?.attempts).toBe(5);

    // The 6th attempt — even with the RIGHT code — is rejected as rate-limited.
    try {
      await verifyOtp(MOBILE, sms.lastCode!);
      expect.unreachable();
    } catch (error) {
      expect((error as DomainError).code).toBe("RATE_LIMITED");
    }
  });

  it("consumes the code so it cannot be replayed", async () => {
    const sms = new CapturingSmsSender();
    await requestOtp(MOBILE, sms);
    await verifyOtp(MOBILE, sms.lastCode!);
    await expect(verifyOtp(MOBILE, sms.lastCode!)).rejects.toThrow(DomainError);
  });

  it("rate-limits repeated requests for the same mobile", async () => {
    const sms = new CapturingSmsSender();
    await requestOtp(MOBILE, sms);
    await requestOtp(MOBILE, sms);
    await requestOtp(MOBILE, sms);
    await expect(requestOtp(MOBILE, sms)).rejects.toThrow(DomainError);
  });

  it("rejects an invalid mobile number before touching the database", async () => {
    const sms = new CapturingSmsSender();
    await expect(requestOtp("not-a-phone", sms)).rejects.toThrow(DomainError);
  });
});

describe("devPeekOtp()", () => {
  it("returns null when ALLOW_DEV_OTP_PEEK is not set, even with a pending code", async () => {
    resetEnvCache();
    const originalValue = process.env.ALLOW_DEV_OTP_PEEK;
    delete process.env.ALLOW_DEV_OTP_PEEK;
    try {
      const sms = new CapturingSmsSender();
      await requestOtp(MOBILE, sms);
      await expect(devPeekOtp(MOBILE)).resolves.toBeNull();
    } finally {
      if (originalValue !== undefined) process.env.ALLOW_DEV_OTP_PEEK = originalValue;
      resetEnvCache();
    }
  });

  it("returns the plaintext code when the flag is explicitly set", async () => {
    resetEnvCache();
    const original = process.env.ALLOW_DEV_OTP_PEEK;
    process.env.ALLOW_DEV_OTP_PEEK = "true";
    try {
      const sms = new CapturingSmsSender();
      await requestOtp(MOBILE, sms);
      await expect(devPeekOtp(MOBILE)).resolves.toBe(sms.lastCode);
    } finally {
      process.env.ALLOW_DEV_OTP_PEEK = original;
      resetEnvCache();
    }
  });

  it("returns null once the code has been consumed", async () => {
    resetEnvCache();
    const original = process.env.ALLOW_DEV_OTP_PEEK;
    process.env.ALLOW_DEV_OTP_PEEK = "true";
    try {
      const sms = new CapturingSmsSender();
      await requestOtp(MOBILE, sms);
      await verifyOtp(MOBILE, sms.lastCode!);
      await expect(devPeekOtp(MOBILE)).resolves.toBeNull();
    } finally {
      process.env.ALLOW_DEV_OTP_PEEK = original;
      resetEnvCache();
    }
  });
});

// Small local import to avoid pulling drizzle's `eq` into the top-level
// import block twice under two different names across this file's history.
import { eq as eq_ } from "drizzle-orm";
