import { loadEnv } from "../../globals/config";
import { FakePaymentProvider } from "./fake";
import type { PaymentProvider } from "./provider";
import { ZarinpalProvider } from "./zarinpal";

export * from "./provider";
export { FakePaymentProvider, recordFakeOutcome } from "./fake";
export { ZarinpalProvider } from "./zarinpal";

let cached: PaymentProvider | undefined;

/** ZarinPal when a merchant id is configured, the fake gateway otherwise. */
export function defaultPaymentProvider(siteUrl: string): PaymentProvider {
  if (cached) return cached;
  const env = loadEnv();
  cached = env.ZARINPAL_MERCHANT_ID
    ? new ZarinpalProvider(env.ZARINPAL_MERCHANT_ID, env.ZARINPAL_SANDBOX)
    : new FakePaymentProvider(siteUrl);
  return cached;
}

export function resetPaymentProviderCache(): void {
  cached = undefined;
}
