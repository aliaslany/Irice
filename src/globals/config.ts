/**
 * Environment configuration.
 *
 * Parsed once, at boot, with zod. The point is that a missing DATABASE_URL or a
 * malformed ZarinPal merchant id fails loudly on startup rather than at 3am
 * inside a checkout callback.
 */
import { randomBytes } from "node:crypto";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),

  /** ZarinPal merchant id: a 36-character UUID-shaped string. */
  ZARINPAL_MERCHANT_ID: z.string().length(36).optional(),
  ZARINPAL_SANDBOX: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  KAVENEGAR_API_KEY: z.string().min(1).optional(),
  KAVENEGAR_OTP_TEMPLATE: z.string().min(1).default("irice-otp"),

  /** Free shipping threshold in RIAL. Never store Toman in config either. */
  FREE_SHIPPING_THRESHOLD_RIAL: z.coerce.number().int().nonnegative().default(0),

  /** Session-cookie signing key. Required in production; see the refine below. */
  SESSION_SECRET: z.string().min(32).optional(),

  /** Used to build absolute callback/redirect URLs for the payment gateway. */
  SITE_URL: z.string().url().default("http://localhost:3000"),

  /**
   * Exposes GET /api/dev/last-otp and makes ConsoleSmsSender retain codes in
   * memory for it to read. Deliberately NOT gated by NODE_ENV: `next start`
   * always runs with NODE_ENV=production regardless of environment, which is
   * exactly the build CI and staging need to log in through without a real
   * SMS provider. Must be left unset (false) on anything a real customer can
   * reach — it lets whoever can read the response log in as any phone number.
   */
  ALLOW_DEV_OTP_PEEK: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Parse and cache the environment. Throws with every failing key listed. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const result = envSchema
    .superRefine((env, ctx) => {
      // A missing secret in dev/test gets a per-process random one below —
      // convenient locally, but a session cookie signed with a secret that
      // changes on every restart would silently log every real customer out.
      // Production must set it explicitly.
      if (env.NODE_ENV === "production" && !env.SESSION_SECRET) {
        ctx.addIssue({
          code: "custom",
          path: ["SESSION_SECRET"],
          message: "SESSION_SECRET is required in production",
        });
      }
    })
    .safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = result.data;
  if (!cached.SESSION_SECRET) {
    cached = { ...cached, SESSION_SECRET: randomBytes(32).toString("hex") };
  }
  return cached;
}

/** Test-only: drop the memoised env so a case can supply its own. */
export function resetEnvCache(): void {
  cached = undefined;
}
