/**
 * ZarinPal adapter — the standard Iranian payment gateway (see
 * docs/MARKET-REVIEW.md). Implements the documented v4 REST contract:
 * request against `/pg/v4/payment/request.json`, send the customer to
 * `/pg/StartPay/{authority}`, verify against `/pg/v4/payment/verify.json`.
 *
 * This environment's egress proxy has no route to zarinpal.com, so this
 * adapter is verified against a mocked `fetch` (see zarinpal.test.ts), not a
 * live sandbox transaction. The request/response shapes follow ZarinPal's
 * published API; treat a live sandbox run as the remaining verification step
 * before this goes to production.
 */
import { toToman, type Rial } from "../../globals/money";
import type { PaymentProvider, PaymentRequestInput, PaymentRequestResult, PaymentVerifyResult } from "./provider";

const LIVE_BASE = "https://api.zarinpal.com";
const SANDBOX_BASE = "https://sandbox.zarinpal.com";
const STARTPAY_HOST = "https://www.zarinpal.com";

/** ZarinPal's documented status codes for a successful call. */
const SUCCESS_CODES = new Set([100, 101]);

interface ZarinpalRequestResponse {
  data?: { code: number; authority?: string; message?: string };
  errors?: unknown;
}

interface ZarinpalVerifyResponse {
  data?: { code: number; ref_id?: number; message?: string };
  errors?: unknown;
}

export class ZarinpalProvider implements PaymentProvider {
  readonly name = "zarinpal" as const;

  constructor(
    private readonly merchantId: string,
    private readonly sandbox: boolean,
  ) {}

  private get base(): string {
    return this.sandbox ? SANDBOX_BASE : LIVE_BASE;
  }

  async requestPayment(input: PaymentRequestInput): Promise<PaymentRequestResult> {
    // ZarinPal's amount unit is Toman, not rial — see globals/money.ts on why
    // we never let a Toman value exist anywhere except at a boundary like this.
    const response = await fetch(`${this.base}/pg/v4/payment/request.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchant_id: this.merchantId,
        amount: toToman(input.amountRial),
        description: input.description,
        callback_url: input.callbackUrl,
        ...(input.mobile ? { metadata: { mobile: input.mobile } } : {}),
      }),
    });

    const body = (await response.json()) as ZarinpalRequestResponse;
    if (!response.ok || !body.data || !SUCCESS_CODES.has(body.data.code) || !body.data.authority) {
      throw new Error(`ZarinPal payment request failed: ${JSON.stringify(body)}`);
    }

    return {
      authority: body.data.authority,
      redirectUrl: `${STARTPAY_HOST}/pg/StartPay/${body.data.authority}`,
    };
  }

  async verifyPayment(authority: string, amountRial: Rial): Promise<PaymentVerifyResult> {
    const response = await fetch(`${this.base}/pg/v4/payment/verify.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchant_id: this.merchantId,
        amount: toToman(amountRial),
        authority,
      }),
    });

    const body = (await response.json()) as ZarinpalVerifyResponse;
    if (body.data && SUCCESS_CODES.has(body.data.code)) {
      return { success: true, refId: String(body.data.ref_id ?? "") };
    }
    return {
      success: false,
      failureReason: body.data?.message ?? `ZarinPal verify failed: ${JSON.stringify(body)}`,
    };
  }
}
