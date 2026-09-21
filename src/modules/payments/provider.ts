/**
 * The payment provider boundary.
 *
 * Every gateway integration — real or fake — implements this. Checkout code
 * never imports ZarinPal or the fake gateway directly; it asks
 * `defaultPaymentProvider()` for whichever one is configured, which is what
 * lets the whole order-placement flow be demoed and tested without a live
 * merchant account.
 */
import type { Rial } from "../../globals/money";

export interface PaymentRequestInput {
  amountRial: Rial;
  /** Shown on the gateway's own payment page. */
  description: string;
  /** Where the gateway redirects back to after the customer pays or cancels. */
  callbackUrl: string;
  /** For a real gateway's own records; optional. */
  mobile?: string;
}

export interface PaymentRequestResult {
  /** The gateway's token for this attempt. */
  authority: string;
  /** Where to send the customer's browser to actually pay. */
  redirectUrl: string;
}

export interface PaymentVerifyResult {
  success: boolean;
  /** The gateway's reference number, present only on success. */
  refId?: string;
  /** Human-readable reason, present only on failure. */
  failureReason?: string;
}

export interface PaymentProvider {
  readonly name: "zarinpal" | "fake";
  requestPayment(input: PaymentRequestInput): Promise<PaymentRequestResult>;
  verifyPayment(authority: string, amountRial: Rial): Promise<PaymentVerifyResult>;
}
