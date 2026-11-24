import { loadConfig } from "../config.js";
import { MemoryMailer } from "../lib/mailer.js";
import { InMemoryRepositories } from "../repositories/memory.js";
import { buildServices, type Services } from "../services.js";

export function createTestServices(): Services & { mailer: MemoryMailer; repos: InMemoryRepositories } {
  const repos = new InMemoryRepositories();
  const mailer = new MemoryMailer();
  const config = loadConfig({
    NODE_ENV: "test",
    IDENTITY_ENCRYPTION_KEY: "test-identity-encryption-key-00000001",
  });
  const services = buildServices({ config, repos, mailer });
  return { ...services, mailer, repos };
}

export const registerInput = {
  fullName: "Ada Lovelace",
  email: "ada@example.com",
  phone: "+4915123456789",
  country: "India",
  intake: "Summer 2027",
  password: "GoodPassword1",
  ageConfirmed: true as const,
  acceptedTermsVersion: "2025-01",
  acceptedPrivacyVersion: "2025-01",
  shareProgressWithConsultancy: false,
};
