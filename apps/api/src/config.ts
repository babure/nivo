import { z } from "zod";

const bool = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  CORS_ORIGINS: z.string().optional(),
  DATABASE_URL: z.string().min(1).optional(),
  IDENTITY_ENCRYPTION_KEY: z.string().min(32).optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  /**
   * Checkout charge currency/amount. Adaptive Pricing requires the charge currency
   * to be a settlement currency on the Stripe account. Leave unset to auto-match
   * the account default (converting €149 when needed). Product list price stays EUR.
   */
  STRIPE_CHARGE_CURRENCY: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z]{3}$/)
    .optional(),
  STRIPE_CHARGE_AMOUNT_CENTS: z.coerce.number().int().positive().optional(),
  ARGON2_MEMORY_KIB: z.coerce.number().int().min(1024).default(19456),
  ARGON2_TIME_COST: z.coerce.number().int().min(2).default(2),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  TRUST_PROXY: bool,
  /** When unset in development, seed dummy personas automatically. */
  SEED_DEV_DATA: z.enum(["true", "false", "auto"]).default("auto"),
  /**
   * Email transport. Add new providers in `createEmailProvider` (e.g. brevo, ses).
   * `memory` keeps messages in-process (tests / offline).
   */
  EMAIL_PROVIDER: z.enum(["memory", "resend"]).default("memory"),
  EMAIL_API_KEY: z.string().min(1).optional(),
  /** e.g. `NIVO <onboarding@resend.dev>` until a custom domain is verified. */
  EMAIL_FROM: z.string().min(3).default("NIVO <onboarding@resend.dev>"),
  /** Google OAuth (optional). Both id + secret required to enable Sign in with Google. */
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  /** Must match an Authorized redirect URI in Google Cloud Console. */
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
});

const DEV_ENCRYPTION_KEY = "dev-only-insecure-identity-encryption-key-0000";

export type AppConfig = Omit<
  z.infer<typeof envSchema>,
  "IDENTITY_ENCRYPTION_KEY" | "CORS_ORIGINS" | "SEED_DEV_DATA" | "GOOGLE_REDIRECT_URI"
> & {
  IDENTITY_ENCRYPTION_KEY: string;
  GOOGLE_REDIRECT_URI: string;
  corsOrigins: string[];
  isProd: boolean;
  isTest: boolean;
  seedDevData: boolean;
};

/** Treat empty strings in .env as "unset". */
function clean(env: Record<string, string | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined && v !== ""),
  );
}

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): AppConfig {
  const parsed = envSchema.parse(clean(env));
  const isProd = parsed.NODE_ENV === "production";

  if (isProd && !parsed.IDENTITY_ENCRYPTION_KEY) {
    throw new Error("IDENTITY_ENCRYPTION_KEY is required in production");
  }
  if (parsed.EMAIL_PROVIDER === "resend" && !parsed.EMAIL_API_KEY) {
    throw new Error("EMAIL_API_KEY is required when EMAIL_PROVIDER=resend");
  }

  const corsOrigins = (parsed.CORS_ORIGINS ?? parsed.APP_URL)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const { CORS_ORIGINS: _ignored, IDENTITY_ENCRYPTION_KEY, SEED_DEV_DATA, GOOGLE_REDIRECT_URI, ...rest } =
    parsed;
  const seedDevData =
    SEED_DEV_DATA === "true" || (SEED_DEV_DATA === "auto" && parsed.NODE_ENV === "development");
  return {
    ...rest,
    GOOGLE_REDIRECT_URI:
      GOOGLE_REDIRECT_URI ?? `http://localhost:${parsed.PORT}/v1/auth/google/callback`,
    IDENTITY_ENCRYPTION_KEY: IDENTITY_ENCRYPTION_KEY ?? DEV_ENCRYPTION_KEY,
    corsOrigins,
    isProd,
    isTest: parsed.NODE_ENV === "test",
    seedDevData,
  };
}
