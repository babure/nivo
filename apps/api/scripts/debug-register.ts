import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createLogger } from "../src/lib/logger.js";
import { MemoryMailer } from "../src/lib/mailer.js";
import { InMemoryRepositories } from "../src/repositories/memory.js";
import { parseStrict } from "../src/lib/errors.js";
import { registerSchema } from "@nivo/shared";

const payload = {
  fullName: "Ada Lovelace",
  email: "ada2@example.com",
  phone: "+4915123456789",
  country: "India",
  intake: "Summer 2027",
  password: "GoodPassword1",
  ageConfirmed: true as const,
  acceptedTermsVersion: "2025-01",
  acceptedPrivacyVersion: "2025-01",
  shareProgressWithConsultancy: false,
};

console.log("parse", parseStrict(registerSchema, payload));

const repos = new InMemoryRepositories();
const mailer = new MemoryMailer();
const config = loadConfig({
  NODE_ENV: "test",
  LOG_LEVEL: "info",
  ARGON2_MEMORY_KIB: "1024",
  ARGON2_TIME_COST: "2",
  IDENTITY_ENCRYPTION_KEY: "test-identity-encryption-key-00000001",
});
try {
  await repos.users.create; // touch
  const { buildServices } = await import("../src/services.js");
  const svc = buildServices({ config, repos, mailer });
  const out = await svc.auth.register(payload);
  console.log("direct register ok", out);
} catch (e) {
  console.error("direct register fail", e);
}
const app = await buildApp({
  config,
  repos,
  mailer,
  logger: createLogger("info"),
});
await app.ready();
const res = await app.inject({
  method: "POST",
  url: "/v1/auth/register",
  payload: { ...payload, email: "ada3@example.com" },
});
console.log("STATUS", res.statusCode);
console.log("BODY", res.body);
await app.close();
