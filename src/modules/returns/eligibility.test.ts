import { describe, expect, it } from "vitest";
import { checkReturnEligibility, RETURN_WINDOW_DAYS } from "./eligibility";

const fulfilledAt = new Date("2026-09-01T00:00:00Z");

describe("checkReturnEligibility()", () => {
  it("allows a return the day after fulfilment", () => {
    const now = new Date(fulfilledAt.getTime() + 24 * 60 * 60 * 1000);
    expect(checkReturnEligibility({ status: "fulfilled", fulfilledAt }, false, now)).toEqual({
      eligible: true,
    });
  });

  it("allows a return right up to the deadline", () => {
    const now = new Date(fulfilledAt.getTime() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000 - 1000);
    expect(checkReturnEligibility({ status: "fulfilled", fulfilledAt }, false, now).eligible).toBe(true);
  });

  it("refuses a return one second past the deadline", () => {
    const now = new Date(fulfilledAt.getTime() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000 + 1000);
    const result = checkReturnEligibility({ status: "fulfilled", fulfilledAt }, false, now);
    expect(result.eligible).toBe(false);
    expect(result.reasonFa).toMatch(/مهلت/);
  });

  it("refuses an order that was never fulfilled", () => {
    const result = checkReturnEligibility({ status: "paid", fulfilledAt: null }, false);
    expect(result.eligible).toBe(false);
    expect(result.reasonFa).toMatch(/تحویل/);
  });

  it("refuses a second request while one is already open", () => {
    const now = new Date(fulfilledAt.getTime() + 24 * 60 * 60 * 1000);
    const result = checkReturnEligibility({ status: "fulfilled", fulfilledAt }, true, now);
    expect(result.eligible).toBe(false);
    expect(result.reasonFa).toMatch(/پیش‌تر/);
  });

  it("refuses an order that was already returned", () => {
    const result = checkReturnEligibility({ status: "returned", fulfilledAt }, false);
    expect(result.eligible).toBe(false);
  });

  it("refuses a cancelled or payment_failed order", () => {
    expect(checkReturnEligibility({ status: "cancelled", fulfilledAt: null }, false).eligible).toBe(false);
    expect(checkReturnEligibility({ status: "payment_failed", fulfilledAt: null }, false).eligible).toBe(false);
  });
});
