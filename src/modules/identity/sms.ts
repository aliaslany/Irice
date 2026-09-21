/**
 * SMS delivery for OTP codes.
 *
 * `ConsoleSmsSender` is the default: it logs the message server-side, which
 * is where a developer without a configured provider reads a code from.
 * `KavenegarSmsSender` is the real adapter for when KAVENEGAR_API_KEY is
 * configured — see docs/MARKET-REVIEW.md on why Kavenegar specifically is
 * the conventional choice in this market.
 *
 * The dev/staging OTP-peek readback (ALLOW_DEV_OTP_PEEK) lives in
 * identity/queries.ts, not here, and reads the database rather than
 * in-process memory — see otp_codes.dev_plaintext_code's comment for why an
 * in-memory Map here does not reliably work in Next.js's bundling model.
 *
 * Outbound network to Kavenegar is not reachable from this build/dev
 * environment (egress is proxied and scoped), so this adapter is verified by
 * unit test against a mocked fetch, not a live send.
 */

export interface SmsSender {
  sendOtp(mobile: string, code: string): Promise<void>;
}

export class ConsoleSmsSender implements SmsSender {
  async sendOtp(mobile: string, code: string): Promise<void> {
    // eslint-disable-next-line no-console -- this IS the delivery channel in dev.
    console.log(`[sms:otp] to ${mobile}: کد ورود آیرایس: ${code} (معتبر تا ۲ دقیقه)`);
  }
}

export class KavenegarSmsSender implements SmsSender {
  constructor(
    private readonly apiKey: string,
    private readonly template: string,
  ) {}

  async sendOtp(mobile: string, code: string): Promise<void> {
    const url = `https://api.kavenegar.com/v1/${this.apiKey}/verify/lookup.json`;
    const params = new URLSearchParams({ receptor: mobile, token: code, template: this.template });
    const response = await fetch(`${url}?${params.toString()}`, { method: "POST" });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Kavenegar OTP send failed: ${response.status} ${body}`);
    }
  }
}

export function defaultSmsSender(): SmsSender {
  const apiKey = process.env.KAVENEGAR_API_KEY;
  const template = process.env.KAVENEGAR_OTP_TEMPLATE ?? "irice-otp";
  return apiKey ? new KavenegarSmsSender(apiKey, template) : new ConsoleSmsSender();
}
