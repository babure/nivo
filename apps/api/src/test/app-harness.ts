import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { buildApp, type BuildAppOptions } from "../app.js";
import { loadConfig } from "../config.js";
import { MemoryMailer } from "../lib/mailer.js";
import { InMemoryRepositories } from "../repositories/memory.js";
import { registerInput } from "./harness.js";

export const WEBHOOK_SECRET = "whsec_test_secret_for_unit_tests";

export async function createTestApp(
  env: Record<string, string> = {},
  overrides: Partial<BuildAppOptions> = {},
) {
  const repos = new InMemoryRepositories();
  const mailer = new MemoryMailer();
  const config = loadConfig({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    IDENTITY_ENCRYPTION_KEY: "test-identity-encryption-key-00000001",
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    ARGON2_MEMORY_KIB: "1024",
    ARGON2_TIME_COST: "2",
    AUTH_RATE_LIMIT_MAX: "1000",
    RATE_LIMIT_MAX: "1000",
    ...env,
  });
  const app = await buildApp({ config, repos, mailer, ...overrides });
  await app.ready();
  return { app, repos, mailer, config };
}

export function cookieFrom(res: LightMyRequestResponse): string {
  const raw = res.headers["set-cookie"];
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (!first) throw new Error("no set-cookie header");
  return first.split(";")[0]!;
}

/** Registers, verifies and logs in; returns the session cookie. */
export async function signUpAndLogin(
  app: FastifyInstance,
  mailer: MemoryMailer,
  overrides: Partial<typeof registerInput> & { referralCode?: string } = {},
): Promise<{ cookie: string; email: string }> {
  const input = { ...registerInput, ...overrides };
  const reg = await app.inject({ method: "POST", url: "/v1/auth/register", payload: input });
  if (reg.statusCode !== 202) throw new Error(`register failed: ${reg.body}`);
  const token = mailer.lastTokenFor(input.email, "verify_email")!;
  const ver = await app.inject({ method: "POST", url: "/v1/auth/verify-email", payload: { token } });
  if (ver.statusCode !== 200) throw new Error(`verify failed: ${ver.body}`);
  const login = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: { email: input.email, password: input.password },
  });
  if (login.statusCode !== 200) throw new Error(`login failed: ${login.body}`);
  return { cookie: cookieFrom(login), email: input.email };
}
