import { describe, expect, it } from "vitest";
import { DomainError, isDomainError, isPostgresUniqueViolation, toErrorResponse } from "./errors";

describe("DomainError", () => {
  it("maps codes to HTTP statuses", () => {
    expect(new DomainError("NOT_FOUND").status).toBe(404);
    expect(new DomainError("OUT_OF_STOCK").status).toBe(409);
    expect(new DomainError("RESERVATION_EXPIRED").status).toBe(410);
    expect(new DomainError("PAYMENT_FAILED").status).toBe(402);
  });

  it("carries Persian customer-facing copy", () => {
    expect(new DomainError("OUT_OF_STOCK").messageFa).toBe("موجودی این محصول کافی نیست.");
  });

  it("keeps the internal message separate from the customer message", () => {
    const error = new DomainError("OUT_OF_STOCK", "lot 7f3 short by 4kg", { lotId: "7f3" });
    expect(error.message).toBe("lot 7f3 short by 4kg");
    expect(error.messageFa).not.toContain("7f3");
  });
});

describe("toErrorResponse()", () => {
  it("renders a domain error with its detail", () => {
    const response = toErrorResponse(new DomainError("VALIDATION", "bad input", { field: "mobile" }));
    expect(response.status).toBe(422);
    expect(response.body.error).toMatchObject({ code: "VALIDATION", detail: { field: "mobile" } });
  });

  it("omits an empty detail object", () => {
    expect(toErrorResponse(new DomainError("NOT_FOUND")).body.error.detail).toBeUndefined();
  });

  it("never leaks an unexpected error's message", () => {
    const response = toErrorResponse(new Error("connection string postgres://user:pw@host"));
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("INTERNAL");
    expect(JSON.stringify(response.body)).not.toContain("postgres://");
  });

  it("identifies domain errors", () => {
    expect(isDomainError(new DomainError("CONFLICT"))).toBe(true);
    expect(isDomainError(new Error("nope"))).toBe(false);
  });
});

describe("isPostgresUniqueViolation()", () => {
  it("recognises a plain error carrying the SQLSTATE code directly", () => {
    expect(isPostgresUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("recognises the code nested on .cause — the actual shape drizzle-orm throws", () => {
    // This is the exact bug this function exists to fix: drizzle wraps the
    // real postgres error in a DrizzleQueryError and moves it to .cause.
    const drizzleShapedError = new Error("Failed query: insert into ...");
    (drizzleShapedError as unknown as { cause: unknown }).cause = { code: "23505" };
    expect(isPostgresUniqueViolation(drizzleShapedError)).toBe(true);
  });

  it("rejects an unrelated Postgres error code", () => {
    expect(isPostgresUniqueViolation({ code: "23503" })).toBe(false); // foreign_key_violation
  });

  it("rejects non-error values without throwing", () => {
    expect(isPostgresUniqueViolation(null)).toBe(false);
    expect(isPostgresUniqueViolation(undefined)).toBe(false);
    expect(isPostgresUniqueViolation("a string")).toBe(false);
    expect(isPostgresUniqueViolation(new Error("plain error, no cause"))).toBe(false);
  });
});
