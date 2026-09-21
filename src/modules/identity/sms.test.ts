import { afterEach, describe, expect, it, vi } from "vitest";
import { KavenegarSmsSender } from "./sms";

describe("KavenegarSmsSender", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to the Kavenegar lookup endpoint with the code as the token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const sender = new KavenegarSmsSender("test-api-key", "irice-otp");
    await sender.sendOtp("09123456789", "12345");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("api.kavenegar.com/v1/test-api-key/verify/lookup.json");
    expect(String(url)).toContain("receptor=09123456789");
    expect(String(url)).toContain("token=12345");
    expect(String(url)).toContain("template=irice-otp");
    expect(init).toMatchObject({ method: "POST" });
  });

  it("throws with the response body when the gateway rejects the send", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("invalid api key", { status: 401 })),
    );
    const sender = new KavenegarSmsSender("bad-key", "irice-otp");
    await expect(sender.sendOtp("09123456789", "12345")).rejects.toThrow(/401/);
  });
});
