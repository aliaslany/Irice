/**
 * Environment configuration.
 *
 * Parsed once, at boot, with zod. The point is that a missing DATABASE_URL or a
 * malformed ZarinPal merchant id fails loudly on startup rather than at 3am
 * inside a checkout callback.
 */
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

  SESSION_SECRET: z.string().min(32).optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Parse and cache the environment. Throws with every failing key listed. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = result.data;
  return cached;
}

/** Test-only: drop the memoised env so a case can supply its own. */
export function resetEnvCache(): void {
  cached = undefined;
}
