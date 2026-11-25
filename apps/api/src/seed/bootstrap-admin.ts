import { randomUUID } from "node:crypto";
import type { AppConfig } from "../config.js";
import { createArgon2Hasher } from "../modules/auth/service.js";
import type { Repositories, UserRecord } from "../repositories/types.js";

/**
 * Ensures at least one super_admin exists on startup.
 * Uses ADMIN_EMAIL + ADMIN_PASSWORD when provided; otherwise (non-prod) creates admin@nivo.test.
 */
export async function bootstrapAdmin(
  repos: Repositories,
  config: AppConfig,
  log: { info: (obj: object, msg?: string) => void; warn: (obj: object, msg?: string) => void },
): Promise<void> {
  const users = await repos.users.list();
  const hasSuperAdmin = users.some((u) => u.role === "super_admin" && !u.deletedAt);
  if (hasSuperAdmin) return;

  const email = (config.ADMIN_EMAIL ?? (config.isProd ? undefined : "admin@nivo.test"))?.trim().toLowerCase();
  const password = config.ADMIN_PASSWORD ?? (config.isProd ? undefined : "NivoTest1234");

  if (!email || !password) {
    log.warn(
      {},
      "No super_admin found. Set ADMIN_EMAIL and ADMIN_PASSWORD to bootstrap the first admin on startup.",
    );
    return;
  }

  if (password.length < 10) {
    throw new Error("ADMIN_PASSWORD must be at least 10 characters");
  }

  const existing = await repos.users.findByEmail(email);
  if (existing) {
    if (existing.role !== "super_admin") {
      await repos.users.update(existing.id, { role: "super_admin", emailVerifiedAt: existing.emailVerifiedAt ?? new Date() });
      log.info({ email }, "Promoted existing user to super_admin");
    }
    return;
  }

  const hasher = createArgon2Hasher({
    memoryCost: config.ARGON2_MEMORY_KIB,
    timeCost: config.ARGON2_TIME_COST,
  });
  const now = new Date();
  const user: UserRecord = {
    id: randomUUID(),
    email,
    fullName: config.ADMIN_FULL_NAME?.trim() || "NIVO Admin",
    phone: "+49000000000",
    country: "DE",
    intake: "ops",
    passwordHash: await hasher.hash(password),
    emailVerifiedAt: now,
    role: "super_admin",
    googleSub: null,
    avatarUrl: null,
    passwordSet: true,
    totpSecret: null,
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: now,
    deletedAt: null,
  };
  await repos.users.create(user);
  log.info({ email }, "Bootstrapped super_admin on startup");
}
