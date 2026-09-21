import { afterEach, describe, expect, it } from "vitest";
import { loadEnv, resetEnvCache } from "./config";

const BASE_ENV = {
  DATABASE_URL: "postgres://localhost:5432/irice",
  ADMIN_TOKEN: "a".repeat(16),
};

describe("loadEnv()", () => {
  afterEach(() => {
    resetEnvCache();
  });

  it("defaults NODE_ENV to development and applies the other defaults", () => {
    const env = loadEnv(BASE_ENV as unknown as NodeJS.ProcessEnv);
    expect(env.NODE_ENV).toBe("development");
    expect(env.ZARINPAL_SANDBOX).toBe(true);
    expect(env.FREE_SHIPPING_THRESHOLD_RIAL).toBe(0);
    expect(env.SITE_URL).toBe("http://localhost:3000");
  });

  it("generates a random session secret outside production rather than erroring", () => {
    const env = loadEnv({ ...BASE_ENV, NODE_ENV: "development" } as unknown as NodeJS.ProcessEnv);
    expect(env.SESSION_SECRET).toBeDefined();
    expect(env.SESSION_SECRET!.length).toBeGreaterThanOrEqual(32);
  });

  it("throws when DATABASE_URL is missing, naming the field", () => {
    expect(() => loadEnv({} as unknown as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);
  });

  it("requires SESSION_SECRET explicitly in production", () => {
    expect(() => loadEnv({ ...BASE_ENV, NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv)).toThrow(
      /SESSION_SECRET/,
    );
  });

  it("accepts production when SESSION_SECRET is provided", () => {
    const env = loadEnv({
      ...BASE_ENV,
      NODE_ENV: "production",
      SESSION_SECRET: "a".repeat(32),
    } as unknown as NodeJS.ProcessEnv);
    expect(env.SESSION_SECRET).toBe("a".repeat(32));
  });

  it("defaults ALLOW_DEV_OTP_PEEK to false", () => {
    const env = loadEnv(BASE_ENV as unknown as NodeJS.ProcessEnv);
    expect(env.ALLOW_DEV_OTP_PEEK).toBe(false);
  });

  it("allows ALLOW_DEV_OTP_PEEK to be explicitly enabled even under NODE_ENV=production", () => {
    // This is the whole point of the flag: next start always sets
    // NODE_ENV=production, and CI/staging still need to log in through it.
    const env = loadEnv({
      ...BASE_ENV,
      NODE_ENV: "production",
      SESSION_SECRET: "a".repeat(32),
      ALLOW_DEV_OTP_PEEK: "true",
    } as unknown as NodeJS.ProcessEnv);
    expect(env.ALLOW_DEV_OTP_PEEK).toBe(true);
  });

  it("requires ADMIN_TOKEN, with no dev fallback, in every environment", () => {
    expect(() => loadEnv({ DATABASE_URL: BASE_ENV.DATABASE_URL } as unknown as NodeJS.ProcessEnv)).toThrow(
      /ADMIN_TOKEN/,
    );
  });

  it("leaves ENAMAD_ID/ENAMAD_CODE unset by default — no fake trust badge without real registration", () => {
    const env = loadEnv(BASE_ENV as unknown as NodeJS.ProcessEnv);
    expect(env.ENAMAD_ID).toBeUndefined();
    expect(env.ENAMAD_CODE).toBeUndefined();
  });

  it("caches the result across calls", () => {
    const first = loadEnv(BASE_ENV as unknown as NodeJS.ProcessEnv);
    const second = loadEnv({ ...BASE_ENV, FREE_SHIPPING_THRESHOLD_RIAL: "999" } as unknown as unknown as NodeJS.ProcessEnv);
    expect(second).toBe(first); // second call's different input is ignored — it's cached
  });
});
