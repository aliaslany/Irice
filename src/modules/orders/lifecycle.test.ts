import { describe, expect, it } from "vitest";
import { DomainError } from "../../globals/errors";
import { canHandle, holdsReservation, nextOrderStatus } from "./lifecycle";

describe("nextOrderStatus()", () => {
  it("moves a pending order to paid on success", () => {
    expect(nextOrderStatus("pending_payment", "pay_success")).toBe("paid");
  });

  it("moves a pending order to payment_failed on failure", () => {
    expect(nextOrderStatus("pending_payment", "pay_fail")).toBe("payment_failed");
  });

  it("lets a failed payment be retried back to pending", () => {
    expect(nextOrderStatus("payment_failed", "retry_payment")).toBe("pending_payment");
  });

  it("expires an abandoned pending order to cancelled", () => {
    expect(nextOrderStatus("pending_payment", "expire")).toBe("cancelled");
  });

  it("moves a paid order through fulfillment", () => {
    expect(nextOrderStatus("paid", "fulfill")).toBe("fulfilled");
  });

  it("allows a return from paid or fulfilled", () => {
    expect(nextOrderStatus("paid", "return")).toBe("returned");
    expect(nextOrderStatus("fulfilled", "return")).toBe("returned");
  });

  it("refuses to pay an already-paid order", () => {
    expect(() => nextOrderStatus("paid", "pay_success")).toThrow(DomainError);
  });

  it("refuses to fulfill a cancelled order", () => {
    try {
      nextOrderStatus("cancelled", "fulfill");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("CONFLICT");
      expect((error as DomainError).detail).toMatchObject({ current: "cancelled", event: "fulfill" });
    }
  });

  it("refuses any event on a terminal returned order", () => {
    expect(() => nextOrderStatus("returned", "return")).toThrow(DomainError);
    expect(() => nextOrderStatus("returned", "fulfill")).toThrow(DomainError);
  });
});

describe("canHandle()", () => {
  it("reports valid and invalid transitions without throwing", () => {
    expect(canHandle("pending_payment", "pay_success")).toBe(true);
    expect(canHandle("cancelled", "pay_success")).toBe(false);
  });
});

describe("holdsReservation()", () => {
  it("is true only while an order might still convert", () => {
    expect(holdsReservation("pending_payment")).toBe(true);
    expect(holdsReservation("payment_failed")).toBe(true);
    expect(holdsReservation("paid")).toBe(false);
    expect(holdsReservation("cancelled")).toBe(false);
    expect(holdsReservation("fulfilled")).toBe(false);
    expect(holdsReservation("returned")).toBe(false);
  });
});
