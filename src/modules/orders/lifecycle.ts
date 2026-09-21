/**
 * Order state machine.
 *
 * Pure. `nextOrderStatus` is the only place an order's status is allowed to
 * change; checkout and payment-verification code call it rather than setting
 * `status` directly, so an invalid transition (shipping a cancelled order,
 * "paying" an already-fulfilled one) is a thrown DomainError instead of a
 * silent column write.
 */
import { DomainError } from "../../globals/errors";

export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "payment_failed"
  | "fulfilled"
  | "cancelled"
  | "returned";

export type OrderEvent =
  | "pay_success"
  | "pay_fail"
  | "retry_payment"
  | "expire"
  | "fulfill"
  | "return";

const TRANSITIONS: Record<OrderStatus, Partial<Record<OrderEvent, OrderStatus>>> = {
  pending_payment: {
    pay_success: "paid",
    pay_fail: "payment_failed",
    expire: "cancelled",
  },
  payment_failed: {
    retry_payment: "pending_payment",
    expire: "cancelled",
  },
  paid: {
    fulfill: "fulfilled",
    return: "returned",
  },
  fulfilled: {
    return: "returned",
  },
  cancelled: {},
  returned: {},
};

/** Advance an order's status, or throw if the event doesn't apply here. */
export function nextOrderStatus(current: OrderStatus, event: OrderEvent): OrderStatus {
  const next = TRANSITIONS[current][event];
  if (!next) {
    throw new DomainError(
      "CONFLICT",
      `order in status "${current}" cannot handle event "${event}"`,
      { current, event },
    );
  }
  return next;
}

export function canHandle(current: OrderStatus, event: OrderEvent): boolean {
  return TRANSITIONS[current][event] !== undefined;
}

/** Whether the order still holds a stock reservation worth releasing. */
export function holdsReservation(status: OrderStatus): boolean {
  return status === "pending_payment" || status === "payment_failed";
}
