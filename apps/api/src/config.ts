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
  ARGON2_MEMORY_KIB: z.coerce.number().int().min(1024).default(19456),
  ARGON2_TIME_COST: z.coerce.number().int().min(2).default(2),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  TRUST_PROXY: bool,
  /** When unset in development, seed dummy personas automatically. */
  SEED_DEV_DATA: z.enum(["true", "false", "auto"]).default("auto"),
});

const DEV_ENCRYPTION_KEY = "dev-only-insecure-identity-encryption-key-0000";

export type AppConfig = Omit<
  z.infer<typeof envSchema>,
  "IDENTITY_ENCRYPTION_KEY" | "CORS_ORIGINS" | "SEED_DEV_DATA"
> & {
  IDENTITY_ENCRYPTION_KEY: string;
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

  const corsOrigins = (parsed.CORS_ORIGINS ?? parsed.APP_URL)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const { CORS_ORIGINS: _ignored, IDENTITY_ENCRYPTION_KEY, SEED_DEV_DATA, ...rest } = parsed;
  const seedDevData =
    SEED_DEV_DATA === "true" || (SEED_DEV_DATA === "auto" && parsed.NODE_ENV === "development");
  return {
    ...rest,
    IDENTITY_ENCRYPTION_KEY: IDENTITY_ENCRYPTION_KEY ?? DEV_ENCRYPTION_KEY,
    corsOrigins,
    isProd,
    isTest: parsed.NODE_ENV === "test",
    seedDevData,
  };
}
