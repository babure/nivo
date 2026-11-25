import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { authenticator } from "otplib";
import {
  DEFAULT_ROLES,
  decryptField,
  deriveKeyFromSecret,
  encryptField,
  type Permission,
  type registerSchema,
} from "@nivo/shared";
import type { z } from "zod";
import { AppError } from "../../lib/errors.js";
import type { AuditLogger } from "../../lib/audit.js";
import type { Mailer } from "../../lib/mailer.js";
import { hashIp, hashToken, newToken } from "../../lib/tokens.js";
import {
  UniqueViolationError,
  type ProfileRecord,
  type Repositories,
  type UserRecord,
} from "../../repositories/types.js";

/** `input` type: callers may omit fields that zod defaults (shareProgressWithConsultancy). */
export type RegisterInput = z.input<typeof registerSchema>;

export type RequestContext = { ip?: string; userAgent?: string };

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

export function createArgon2Hasher(opts: {
  memoryCost: number;
  timeCost: number;
  parallelism?: number;
}): PasswordHasher {
  const params = {
    type: argon2.argon2id,
    memoryCost: opts.memoryCost,
    timeCost: opts.timeCost,
    parallelism: opts.parallelism ?? 1,
  };
  return {
    hash: (password) => argon2.hash(password, params),
    async verify(hash, password) {
      try {
        return await argon2.verify(hash, password);
      } catch {
        return false;
      }
    },
  };
}

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

export type PublicUser = {
  id: string;
  email: string;
  fullName: string;
  emailVerified: boolean;
  role: string | null;
  totpEnabled: boolean;
  avatarUrl: string | null;
  passwordSet: boolean;
  googleLinked: boolean;
};

export function toPublicUser(u: UserRecord): PublicUser {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    emailVerified: u.emailVerifiedAt !== null,
    role: u.role,
    totpEnabled: u.totpSecret !== null,
    avatarUrl: u.avatarUrl,
    passwordSet: u.passwordSet,
    googleLinked: Boolean(u.googleSub),
  };
}

export function permissionsFor(user: Pick<UserRecord, "role">): readonly Permission[] {
  return user.role ? (DEFAULT_ROLES[user.role] ?? []) : [];
}

export type AuthContext = {
  user: UserRecord;
  sessionId: string;
  permissions: readonly Permission[];
};

export type AuthServiceDeps = {
  repos: Repositories;
  mailer: Mailer;
  hasher: PasswordHasher;
  audit: AuditLogger;
  encryptionSecret: string;
  now?: () => Date;
};

export class AuthService {
  private readonly now: () => Date;
  private readonly key: Buffer;
  private dummyHash: Promise<string> | null = null;

  constructor(private readonly deps: AuthServiceDeps) {
    this.now = deps.now ?? (() => new Date());
    this.key = deriveKeyFromSecret(deps.encryptionSecret);
  }

  /** Burns comparable CPU when the account does not exist (timing equalisation). */
  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.deps.hasher.hash("nivo-dummy-password-for-timing");
    return this.dummyHash;
  }

  async register(input: RegisterInput, ctx: RequestContext = {}): Promise<{ status: "pending_verification" }> {
    const { repos, mailer, hasher } = this.deps;

    for (const [slug, accepted] of [
      ["terms", input.acceptedTermsVersion],
      ["privacy", input.acceptedPrivacyVersion],
    ] as const) {
      const doc = await repos.legal.getPublished(slug);
      if (doc && doc.version !== accepted) {
        throw new AppError("TERMS_REACCEPT_REQUIRED", `Please accept the current ${slug} version.`);
      }
    }

    const existing = await repos.users.findByEmail(input.email);
    // Anti-enumeration: identical response whether or not the email is taken.
    if (existing) {
      await mailer.send({ to: input.email, template: "already_registered" });
      return { status: "pending_verification" };
    }

    const passwordHash = await hasher.hash(input.password);
    const now = this.now();
    const user: UserRecord = {
      id: randomUUID(),
      email: input.email,
      fullName: input.fullName,
      phone: input.phone,
      country: input.country,
      intake: input.intake,
      passwordHash,
      emailVerifiedAt: null,
      role: null,
      googleSub: null,
      avatarUrl: null,
      passwordSet: true,
      totpSecret: null,
      failedLoginCount: 0,
      lockedUntil: null,
      createdAt: now,
      deletedAt: null,
    };

    try {
      await repos.users.create(user);
    } catch (err) {
      if (err instanceof UniqueViolationError) return { status: "pending_verification" };
      throw err;
    }

    const consultancy = input.referralCode
      ? await repos.consultancies.findByReferralCode(input.referralCode)
      : null;
    const profile: ProfileRecord = {
      userId: user.id,
      paymentStatus: "unpaid",
      paidAt: null,
      identityComplete: false,
      consultancyId: consultancy?.id ?? null,
      referralCode: consultancy ? (input.referralCode ?? null) : null,
      shareProgressWithConsultancy: Boolean(consultancy) && input.shareProgressWithConsultancy === true,
    };
    await repos.profiles.upsert(profile);

    const ipHash = hashIp(ctx.ip);
    const consentBase = { userId: user.id, ipHash, acceptedAt: now };
    await repos.consents.add({ id: randomUUID(), kind: "terms", version: input.acceptedTermsVersion, ...consentBase });
    await repos.consents.add({ id: randomUUID(), kind: "privacy", version: input.acceptedPrivacyVersion, ...consentBase });
    if (profile.shareProgressWithConsultancy) {
      await repos.consents.add({ id: randomUUID(), kind: "consultancy_share", version: "1", ...consentBase });
    }

    await this.issueToken(user, "verify_email", VERIFY_TTL_MS);
    await this.deps.audit.append({ actorId: user.id, action: "auth.register", entityType: "user", entityId: user.id });
    return { status: "pending_verification" };
  }

  private async issueToken(user: UserRecord, purpose: "verify_email" | "reset_password", ttl: number): Promise<void> {
    const token = newToken();
    await this.deps.repos.tokens.create({
      tokenHash: hashToken(token),
      userId: user.id,
      purpose,
      expiresAt: new Date(this.now().getTime() + ttl),
      usedAt: null,
    });
    await this.deps.mailer.send({ to: user.email, template: purpose, token });
  }

  async verifyEmail(token: string): Promise<void> {
    const rec = await this.deps.repos.tokens.consume(hashToken(token), "verify_email", this.now());
    if (!rec) throw new AppError("VALIDATION_FAILED", "Invalid or expired verification link.");
    await this.deps.repos.users.update(rec.userId, { emailVerifiedAt: this.now() });
    await this.deps.audit.append({ actorId: rec.userId, action: "auth.verify_email", entityType: "user", entityId: rec.userId });
    const user = await this.deps.repos.users.findById(rec.userId);
    if (user) {
      void this.deps.mailer
        .send({ to: user.email, template: "welcome", vars: { fullName: user.fullName } })
        .catch(() => undefined);
    }
  }

  /**
   * Sign in or register via a verified Google profile.
   * New accounts are students with email already verified; profile fields can be completed later.
   */
  async loginWithGoogle(
    profile: { sub: string; email: string; name: string; picture?: string | null },
    opts: {
      referralCode?: string | null;
      termsVersion?: string | null;
      privacyVersion?: string | null;
    } = {},
    ctx: RequestContext = {},
  ): Promise<{ user: UserRecord; sessionToken: string; expiresAt: Date; created: boolean }> {
    const { repos, hasher } = this.deps;
    const now = this.now();
    const email = profile.email.trim().toLowerCase();
    const avatarUrl = profile.picture ?? null;

    let user = await repos.users.findByGoogleSub(profile.sub);
    let created = false;

    if (!user) {
      user = await repos.users.findByEmail(email);
      if (user) {
        await repos.users.update(user.id, {
          googleSub: profile.sub,
          emailVerifiedAt: user.emailVerifiedAt ?? now,
          fullName: user.fullName || profile.name,
          ...(avatarUrl ? { avatarUrl } : {}),
        });
        user = (await repos.users.findById(user.id))!;
      }
    } else if (avatarUrl && user.avatarUrl !== avatarUrl) {
      await repos.users.update(user.id, { avatarUrl });
      user = (await repos.users.findById(user.id))!;
    }

    if (!user) {
      const terms =
        opts.termsVersion ?? (await repos.legal.getPublished("terms"))?.version ?? "2025-01";
      const privacy =
        opts.privacyVersion ?? (await repos.legal.getPublished("privacy"))?.version ?? "2025-01";

      const passwordHash = await hasher.hash(randomUUID());
      const newUser: UserRecord = {
        id: randomUUID(),
        email,
        fullName: profile.name,
        phone: "",
        country: "Unknown",
        intake: "TBD",
        passwordHash,
        emailVerifiedAt: now,
        role: null,
        googleSub: profile.sub,
        avatarUrl,
        passwordSet: false,
        totpSecret: null,
        failedLoginCount: 0,
        lockedUntil: null,
        createdAt: now,
        deletedAt: null,
      };
      try {
        await repos.users.create(newUser);
        user = newUser;
        created = true;
        const consultancy = opts.referralCode
          ? await repos.consultancies.findByReferralCode(opts.referralCode)
          : null;
        await repos.profiles.upsert({
          userId: user.id,
          paymentStatus: "unpaid",
          paidAt: null,
          identityComplete: false,
          consultancyId: consultancy?.id ?? null,
          referralCode: consultancy ? (opts.referralCode ?? null) : null,
          shareProgressWithConsultancy: false,
        });
        const ipHash = hashIp(ctx.ip);
        await repos.consents.add({
          id: randomUUID(),
          userId: user.id,
          kind: "terms",
          version: terms,
          ipHash,
          acceptedAt: now,
        });
        await repos.consents.add({
          id: randomUUID(),
          userId: user.id,
          kind: "privacy",
          version: privacy,
          ipHash,
          acceptedAt: now,
        });
        await this.deps.audit.append({
          actorId: user.id,
          action: "auth.google_register",
          entityType: "user",
          entityId: user.id,
        });
        void this.deps.mailer
          .send({ to: user.email, template: "welcome", vars: { fullName: user.fullName } })
          .catch(() => undefined);
      } catch (err) {
        if (!(err instanceof UniqueViolationError)) throw err;
        user = await repos.users.findByEmail(email);
        if (!user) throw err;
        await repos.users.update(user.id, {
          googleSub: profile.sub,
          emailVerifiedAt: user.emailVerifiedAt ?? now,
          ...(avatarUrl ? { avatarUrl } : {}),
        });
        user = (await repos.users.findById(user.id))!;
      }
    }

    if (user.lockedUntil && user.lockedUntil > now) {
      throw new AppError("AUTH_LOCKED", "Too many failed attempts. Try again later.");
    }

    await repos.users.update(user.id, { failedLoginCount: 0, lockedUntil: null });
    const sessionToken = newToken();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await repos.sessions.create({
      id: hashToken(sessionToken),
      userId: user.id,
      ipHash: hashIp(ctx.ip),
      userAgent: ctx.userAgent?.slice(0, 256) ?? null,
      expiresAt,
      createdAt: now,
    });
    await this.deps.audit.append({
      actorId: user.id,
      action: created ? "auth.google_login_new" : "auth.google_login",
      entityType: "user",
      entityId: user.id,
    });
    return { user, sessionToken, expiresAt, created };
  }

  async login(
    input: { email: string; password: string; totp?: string },
    ctx: RequestContext = {},
  ): Promise<{ user: UserRecord; sessionToken: string; expiresAt: Date }> {
    const { repos, hasher } = this.deps;
    const now = this.now();
    const user = await repos.users.findByEmail(input.email);

    if (!user) {
      await hasher.verify(await this.getDummyHash(), input.password);
      throw new AppError("AUTH_INVALID_CREDENTIALS", "Invalid email or password.");
    }

    if (user.lockedUntil && user.lockedUntil > now) {
      throw new AppError("AUTH_LOCKED", "Too many failed attempts. Try again later.");
    }

    if (!user.passwordSet) {
      await hasher.verify(await this.getDummyHash(), input.password);
      throw new AppError(
        "AUTH_INVALID_CREDENTIALS",
        "This account uses Google sign-in. Sign in with Google, or use Forgot password to set a password.",
      );
    }

    const ok = await hasher.verify(user.passwordHash, input.password);
    if (!ok) {
      const failed = user.failedLoginCount + 1;
      const lock = failed >= MAX_FAILED_LOGINS;
      await repos.users.update(user.id, {
        failedLoginCount: lock ? 0 : failed,
        lockedUntil: lock ? new Date(now.getTime() + LOCKOUT_MS) : user.lockedUntil,
      });
      await this.deps.audit.append({
        actorId: user.id,
        action: lock ? "auth.locked" : "auth.login_failed",
        entityType: "user",
        entityId: user.id,
      });
      throw new AppError("AUTH_INVALID_CREDENTIALS", "Invalid email or password.");
    }

    if (!user.emailVerifiedAt) {
      throw new AppError("AUTH_EMAIL_NOT_VERIFIED", "Please verify your email first.");
    }

    if (user.totpSecret) {
      if (!input.totp) throw new AppError("AUTH_2FA_REQUIRED", "Two-factor code required.");
      const secret = decryptField(user.totpSecret, this.key);
      if (!authenticator.check(input.totp, secret)) {
        throw new AppError("AUTH_INVALID_CREDENTIALS", "Invalid email or password.");
      }
    }

    await repos.users.update(user.id, { failedLoginCount: 0, lockedUntil: null });
    const sessionToken = newToken();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await repos.sessions.create({
      id: hashToken(sessionToken),
      userId: user.id,
      ipHash: hashIp(ctx.ip),
      userAgent: ctx.userAgent?.slice(0, 256) ?? null,
      expiresAt,
      createdAt: now,
    });
    await this.deps.audit.append({ actorId: user.id, action: "auth.login", entityType: "user", entityId: user.id });
    return { user, sessionToken, expiresAt };
  }

  async resolveSession(token: string): Promise<AuthContext | null> {
    const sessionId = hashToken(token);
    const session = await this.deps.repos.sessions.findById(sessionId);
    if (!session) return null;
    if (session.expiresAt <= this.now()) {
      await this.deps.repos.sessions.delete(sessionId);
      return null;
    }
    const user = await this.deps.repos.users.findById(session.userId);
    if (!user) return null;
    return { user, sessionId, permissions: permissionsFor(user) };
  }

  async logout(token: string): Promise<void> {
    const ctx = await this.resolveSession(token);
    await this.deps.repos.sessions.delete(hashToken(token));
    if (ctx) {
      await this.deps.audit.append({ actorId: ctx.user.id, action: "auth.logout", entityType: "user", entityId: ctx.user.id });
    }
  }

  /** Always resolves; never reveals whether the email exists. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.deps.repos.users.findByEmail(email);
    if (!user) return;
    await this.issueToken(user, "reset_password", RESET_TTL_MS);
    await this.deps.audit.append({ actorId: user.id, action: "auth.forgot_password", entityType: "user", entityId: user.id });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const rec = await this.deps.repos.tokens.consume(hashToken(token), "reset_password", this.now());
    if (!rec) throw new AppError("VALIDATION_FAILED", "Invalid or expired reset link.");
    const passwordHash = await this.deps.hasher.hash(newPassword);
    await this.deps.repos.users.update(rec.userId, {
      passwordHash,
      passwordSet: true,
      failedLoginCount: 0,
      lockedUntil: null,
      // possession of the mailbox proves the email
      emailVerifiedAt: this.now(),
    });
    await this.deps.repos.sessions.deleteAllForUser(rec.userId);
    await this.deps.audit.append({ actorId: rec.userId, action: "auth.reset_password", entityType: "user", entityId: rec.userId });
  }

  /** Step 1 of TOTP enrolment: returns a secret for the authenticator app (not yet active). */
  async beginTotpSetup(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.deps.repos.users.findById(userId);
    if (!user) throw new AppError("NOT_FOUND", "User not found.");
    if (user.totpSecret) throw new AppError("CONFLICT", "Two-factor is already enabled.");
    const secret = authenticator.generateSecret();
    return { secret, otpauthUrl: authenticator.keyuri(user.email, "NIVO", secret) };
  }

  /** Step 2: proves the user holds the secret, then stores it encrypted. */
  async enableTotp(userId: string, secret: string, code: string): Promise<void> {
    if (!authenticator.check(code, secret)) {
      throw new AppError("VALIDATION_FAILED", "Invalid two-factor code.");
    }
    await this.deps.repos.users.update(userId, {
      totpSecret: encryptField(secret, this.key, "v1"),
    });
    await this.deps.audit.append({ actorId: userId, action: "auth.totp_enabled", entityType: "user", entityId: userId });
  }

  /** Re-confirm TOTP for privileged actions (REQ-ADM-05). */
  async verifyTotp(userId: string, code: string): Promise<void> {
    const user = await this.deps.repos.users.findById(userId);
    if (!user?.totpSecret) {
      throw new AppError("AUTH_2FA_REQUIRED", "Two-factor authentication is not enabled.");
    }
    const secret = decryptField(user.totpSecret, this.key);
    if (!authenticator.check(code, secret)) {
      throw new AppError("AUTH_2FA_INVALID", "Invalid two-factor code.");
    }
  }

  /**
   * Set or change password. Google-only accounts (passwordSet=false) can set without current password.
   * Accounts that already have a password must confirm currentPassword.
   */
  async setPassword(
    userId: string,
    input: { password: string; currentPassword?: string },
  ): Promise<void> {
    const user = await this.deps.repos.users.findById(userId);
    if (!user) throw new AppError("NOT_FOUND", "User not found.");

    if (user.passwordSet) {
      if (!input.currentPassword) {
        throw new AppError("VALIDATION_FAILED", "Current password is required.");
      }
      const ok = await this.deps.hasher.verify(user.passwordHash, input.currentPassword);
      if (!ok) throw new AppError("AUTH_INVALID_CREDENTIALS", "Current password is incorrect.");
    }

    const passwordHash = await this.deps.hasher.hash(input.password);
    await this.deps.repos.users.update(userId, { passwordHash, passwordSet: true });
    await this.deps.audit.append({
      actorId: userId,
      action: user.passwordSet ? "auth.password_changed" : "auth.password_set",
      entityType: "user",
      entityId: userId,
    });
  }

  async requestDeletion(
    userId: string,
    input: { password?: string; confirmEmail?: string },
  ): Promise<{ created: boolean }> {
    const user = await this.deps.repos.users.findById(userId);
    if (!user) throw new AppError("NOT_FOUND", "User not found.");

    if (user.passwordSet) {
      if (!input.password || !(await this.deps.hasher.verify(user.passwordHash, input.password))) {
        throw new AppError("AUTH_INVALID_CREDENTIALS", "Password confirmation failed.");
      }
    } else {
      const email = (input.confirmEmail ?? "").trim().toLowerCase();
      if (!email || email !== user.email) {
        throw new AppError("VALIDATION_FAILED", "Type your account email to confirm deletion.");
      }
    }

    const res = await this.deps.repos.requests.addDeletionRequest(userId, this.now());
    if (res.created) {
      await this.deps.audit.append({
        actorId: userId,
        action: "privacy.deletion_requested",
        entityType: "user",
        entityId: userId,
      });
    }
    return { created: res.created };
  }

  async me(ctx: AuthContext): Promise<{ user: PublicUser; paymentStatus: string; identityComplete: boolean; permissions: readonly Permission[] }> {
    const profile = await this.deps.repos.profiles.get(ctx.user.id);
    return {
      user: toPublicUser(ctx.user),
      paymentStatus: profile?.paymentStatus ?? "unpaid",
      identityComplete: profile?.identityComplete ?? false,
      permissions: ctx.permissions,
    };
  }
}
