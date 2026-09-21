import { afterEach, describe, expect, it, vi } from "vitest";
import { fromToman } from "../../globals/money";
import { ZarinpalProvider } from "./zarinpal";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ZarinpalProvider.requestPayment()", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts the amount in Toman, not rial, and returns the StartPay redirect", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: { code: 100, authority: "A00000000000000000000000000123456789" } }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new ZarinpalProvider("merchant-id", true);
    const result = await provider.requestPayment({
      amountRial: fromToman(593_000),
      description: "سفارش آزمایشی",
      callbackUrl: "https://irice.ir/pay/callback",
    });

    expect(result.authority).toBe("A00000000000000000000000000123456789");
    expect(result.redirectUrl).toBe(
      "https://www.zarinpal.com/pg/StartPay/A00000000000000000000000000123456789",
    );

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://sandbox.zarinpal.com/pg/v4/payment/request.json");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.amount).toBe(593_000); // Toman, not the 5,930,000 rial passed in.
    expect(body.merchant_id).toBe("merchant-id");
  });

  it("uses the live host when sandbox is false", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: { code: 100, authority: "A123" } }));
    vi.stubGlobal("fetch", fetchMock);

    await new ZarinpalProvider("m", false).requestPayment({
      amountRial: fromToman(100_000),
      description: "x",
      callbackUrl: "https://irice.ir/pay/callback",
    });

    expect(String(fetchMock.mock.calls[0]![0])).toBe("https://api.zarinpal.com/pg/v4/payment/request.json");
  });

  it("throws with the gateway's own error body on a non-success code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ data: { code: -9, message: "اطلاعات ارسال شده ناقص است" } })),
    );
    const provider = new ZarinpalProvider("merchant-id", true);
    await expect(
      provider.requestPayment({
        amountRial: fromToman(100_000),
        description: "x",
        callbackUrl: "https://irice.ir/pay/callback",
      }),
    ).rejects.toThrow(/ZarinPal payment request failed/);
  });
});

describe("ZarinpalProvider.verifyPayment()", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reports success with the ref id on a verified payment", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ data: { code: 100, ref_id: 987654321 } })));
    const provider = new ZarinpalProvider("merchant-id", true);
    const result = await provider.verifyPayment("A123", fromToman(593_000));
    expect(result).toEqual({ success: true, refId: "987654321" });
  });

  it("treats code 101 (already verified) as success too", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ data: { code: 101, ref_id: 1 } })));
    const provider = new ZarinpalProvider("merchant-id", true);
    expect((await provider.verifyPayment("A123", fromToman(1000))).success).toBe(true);
  });

  it("reports failure with the gateway's message on a rejected verify", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ data: { code: -21, message: "تراکنش ناموفق بود" } })),
    );
    const provider = new ZarinpalProvider("merchant-id", true);
    const result = await provider.verifyPayment("A123", fromToman(593_000));
    expect(result.success).toBe(false);
    expect(result.failureReason).toBe("تراکنش ناموفق بود");
  });
});
