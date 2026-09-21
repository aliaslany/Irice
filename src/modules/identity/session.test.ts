import { describe, expect, it } from "vitest";
import { createSessionToken, SESSION_TTL_SECONDS, verifySessionToken } from "./session";

const SECRET = "test-secret-at-least-32-characters-long";

describe("createSessionToken() / verifySessionToken()", () => {
  it("round-trips a valid token", () => {
    const token = createSessionToken("customer-1", SECRET);
    expect(verifySessionToken(token, SECRET)).toEqual({ customerId: "customer-1" });
  });

  it("rejects a token signed with a different secret", () => {
    const token = createSessionToken("customer-1", SECRET);
    expect(verifySessionToken(token, "a-completely-different-secret-value")).toBeNull();
  });

  it("rejects a tampered customer id even with a valid-shaped signature", () => {
    const token = createSessionToken("customer-1", SECRET);
    const [, expiry, sig] = token.split(".");
    const tampered = `customer-2.${expiry}.${sig}`;
    expect(verifySessionToken(tampered, SECRET)).toBeNull();
  });

  it("rejects an expired token", () => {
    const issued = new Date("2026-01-01T00:00:00Z");
    const token = createSessionToken("customer-1", SECRET, issued);
    const wayLater = new Date(issued.getTime() + (SESSION_TTL_SECONDS + 1) * 1000);
    expect(verifySessionToken(token, SECRET, wayLater)).toBeNull();
  });

  it("honours a custom TTL, shorter than the default", () => {
    const issued = new Date("2026-01-01T00:00:00Z");
    const shortTtl = 60 * 60 * 8; // 8 hours — what the admin cookie uses
    const token = createSessionToken("admin", SECRET, issued, shortTtl);

    const stillValid = new Date(issued.getTime() + shortTtl * 1000 - 1000);
    expect(verifySessionToken(token, SECRET, stillValid)).toEqual({ customerId: "admin" });

    const justExpired = new Date(issued.getTime() + shortTtl * 1000 + 1000);
    expect(verifySessionToken(token, SECRET, justExpired)).toBeNull();
  });

  it("accepts a token right up to its expiry boundary", () => {
    const issued = new Date("2026-01-01T00:00:00Z");
    const token = createSessionToken("customer-1", SECRET, issued);
    const justBefore = new Date(issued.getTime() + SESSION_TTL_SECONDS * 1000 - 1000);
    expect(verifySessionToken(token, SECRET, justBefore)).toEqual({ customerId: "customer-1" });
  });

  it("rejects malformed input without throwing", () => {
    expect(verifySessionToken(null, SECRET)).toBeNull();
    expect(verifySessionToken(undefined, SECRET)).toBeNull();
    expect(verifySessionToken("", SECRET)).toBeNull();
    expect(verifySessionToken("not-a-token", SECRET)).toBeNull();
    expect(verifySessionToken("a.b", SECRET)).toBeNull();
    expect(verifySessionToken("a.b.c.d", SECRET)).toBeNull();
  });

  it("rejects a non-numeric expiry field", () => {
    expect(verifySessionToken("customer-1.not-a-number.deadbeef", SECRET)).toBeNull();
  });
});
