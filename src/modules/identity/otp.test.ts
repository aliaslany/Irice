import { describe, expect, it } from "vitest";
import { generateOtpCode, hashOtpCode, OTP_LENGTH, otpExpiresAt, verifyOtpHash } from "./otp";

describe("generateOtpCode()", () => {
  it("always produces OTP_LENGTH digits, zero-padded", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateOtpCode();
      expect(code).toHaveLength(OTP_LENGTH);
      expect(code).toMatch(/^\d+$/);
    }
  });
});

describe("hashOtpCode() / verifyOtpHash()", () => {
  it("verifies a matching code", () => {
    const code = "12345";
    expect(verifyOtpHash(code, hashOtpCode(code))).toBe(true);
  });

  it("rejects a wrong code", () => {
    expect(verifyOtpHash("54321", hashOtpCode("12345"))).toBe(false);
  });

  it("never stores the code itself in the hash", () => {
    expect(hashOtpCode("12345")).not.toContain("12345");
  });

  it("is deterministic", () => {
    expect(hashOtpCode("12345")).toBe(hashOtpCode("12345"));
  });
});

describe("otpExpiresAt()", () => {
  it("expires 120 seconds after issue", () => {
    const now = new Date("2026-09-20T12:00:00Z");
    expect(otpExpiresAt(now).getTime() - now.getTime()).toBe(120_000);
  });
});
