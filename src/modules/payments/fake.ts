/**
 * A fake gateway, used whenever ZARINPAL_MERCHANT_ID isn't configured (the
 * default in dev, CI, and this build environment — see docs/ARCHITECTURE.md
 * on why the real one can't be exercised end-to-end here).
 *
 * It behaves like a real redirect-based IPG: `requestPayment` returns a
 * redirect URL, but instead of a bank page it points at
 * `/pay/fake/[authority]`, an internal page with "پرداخت موفق" / "پرداخت
 * ناموفق" buttons that redirect to the real callback URL with the same query
 * shape ZarinPal uses (`Authority`, `Status`). This is what lets the e2e test
 * — and a developer — drive a complete checkout without a merchant account.
 *
 * The chosen outcome is stored in the database (fakePaymentOutcomes), not in
 * process memory — see that table's schema comment for why an in-memory Map
 * here does not reliably work in Next.js's bundling model.
 */
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../../db/client";
import { fakePaymentOutcomes } from "../../db/schema/index";
import type { Rial } from "../../globals/money";
import type { PaymentProvider, PaymentRequestInput, PaymentRequestResult, PaymentVerifyResult } from "./provider";

export async function recordFakeOutcome(authority: string, outcome: "success" | "failure"): Promise<void> {
  await db
    .insert(fakePaymentOutcomes)
    .values({ authority, outcome })
    .onConflictDoUpdate({ target: fakePaymentOutcomes.authority, set: { outcome } });
}

export class FakePaymentProvider implements PaymentProvider {
  readonly name = "fake" as const;

  constructor(private readonly siteUrl: string) {}

  async requestPayment(_input: PaymentRequestInput): Promise<PaymentRequestResult> {
    const authority = `FAKE-${randomUUID()}`;
    return { authority, redirectUrl: `${this.siteUrl}/pay/fake/${authority}` };
  }

  async verifyPayment(authority: string, _amountRial: Rial): Promise<PaymentVerifyResult> {
    const [row] = await db
      .select({ outcome: fakePaymentOutcomes.outcome })
      .from(fakePaymentOutcomes)
      .where(eq(fakePaymentOutcomes.authority, authority));

    if (row?.outcome === "success") {
      return { success: true, refId: `FAKE-REF-${authority.slice(-8)}` };
    }
    return { success: false, failureReason: "شبیه‌ساز پرداخت: تراکنش توسط کاربر لغو شد." };
  }
}
