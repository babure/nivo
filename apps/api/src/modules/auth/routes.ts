import type { FastifyInstance, FastifyReply } from "fastify";
import {
  emailSchema,
  passwordPresentSchema,
  passwordSchema,
  referralCodeSchema,
  registerSchema,
} from "@nivo/shared";
import { z } from "zod";
import { csrfCookieName, issueCsrfToken, peekCsrfToken } from "../../lib/csrf.js";
import { AppError, parseStrict } from "../../lib/errors.js";
import { requireAuthContext, sessionCookieName } from "../../plugins/auth.js";
import {
  buildGoogleAuthorizeUrl,
  exchangeGoogleCode,
  googleOAuthEnabled,
  newOAuthState,
  profileFromGoogleAccessToken,
  verifyGoogleIdToken,
} from "./google.js";
import { SESSION_TTL_MS } from "./service.js";

const OAUTH_STATE_COOKIE = "nivo_oauth_state";
const oauthStartQuery = z.object({
  next: z.string().max(200).optional(),
  ref: z.string().max(32).optional(),
  terms: z.string().max(40).optional(),
  privacy: z.string().max(40).optional(),
  share: z
    .enum(["0", "1", "true", "false"])
    .optional()
    .transform((v) => v === "1" || v === "true"),
});

type OAuthStateCookie = {
  state: string;
  next?: string;
  ref?: string;
  terms?: string;
  privacy?: string;
  share?: boolean;
};

const loginSchema = z.object({
  email: emailSchema,
  // do not apply strength rules at login (legacy passwords must still be able to sign in)
  password: passwordPresentSchema,
});
const tokenSchema = z.object({
  token: z.string().min(20, "Invalid or incomplete token").max(200),
});
const forgotSchema = z.object({ email: emailSchema });
const resetSchema = z.object({
  token: z.string().min(20, "Invalid or incomplete token").max(200),
  password: passwordSchema,
});
const deletionSchema = z.object({
  password: passwordPresentSchema.optional(),
  confirmEmail: emailSchema.optional(),
});
const setPasswordBody = z.object({
  password: passwordSchema,
  currentPassword: passwordPresentSchema.optional(),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const { auth } = app.services;
  const cookieName = sessionCookieName(app.config.isProd);
  const limit = {
    config: { rateLimit: { max: app.config.AUTH_RATE_LIMIT_MAX, timeWindow: "1 minute" } },
  };

  const csrfName = csrfCookieName(app.config.isProd);
  const setSessionCookie = (reply: FastifyReply, token: string, expiresAt: Date, sessionId?: string) => {
    reply.setCookie(cookieName, token, {
      httpOnly: true,
      secure: app.config.isProd,
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });
    if (sessionId) {
      const csrf = peekCsrfToken(sessionId) ?? issueCsrfToken(sessionId);
      reply.setCookie(csrfName, csrf, {
        httpOnly: false,
        secure: app.config.isProd,
        sameSite: "lax",
        path: "/",
      });
    }
  };
  const clearSessionCookie = (reply: FastifyReply) =>
    reply.clearCookie(cookieName, {
      httpOnly: true,
      secure: app.config.isProd,
      sameSite: "lax",
      path: "/",
    });

  app.post("/v1/auth/register", limit, async (req, reply) => {
    const input = parseStrict(registerSchema, req.body);
    const result = await auth.register(input, { ip: req.ip, userAgent: req.headers["user-agent"] });
    return reply.code(202).send(result);
  });

  app.post("/v1/auth/verify-email", limit, async (req, reply) => {
    const { token } = parseStrict(tokenSchema, req.body);
    await auth.verifyEmail(token);
    return reply.send({ status: "verified" });
  });

  app.post("/v1/auth/login", limit, async (req, reply) => {
    const input = parseStrict(loginSchema, req.body);
    const { user, sessionToken, expiresAt } = await auth.login(input, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    const { hashToken } = await import("../../lib/tokens.js");
    setSessionCookie(reply, sessionToken, expiresAt, hashToken(sessionToken));
    return reply.send({
      user: {
        id: user.id,
        fullName: user.fullName,
        role: user.role,
      },
    });
  });

  app.post("/v1/auth/logout", async (req, reply) => {
    const token = req.cookies?.[cookieName];
    if (token) await auth.logout(token);
    clearSessionCookie(reply);
    return reply.code(204).send();
  });

  app.post("/v1/auth/forgot-password", limit, async (req, reply) => {
    const { email } = parseStrict(forgotSchema, req.body);
    await auth.forgotPassword(email);
    // Same response whether or not the account exists.
    return reply.code(202).send({ status: "if_account_exists_email_sent" });
  });

  app.post("/v1/auth/reset-password", limit, async (req, reply) => {
    const { token, password } = parseStrict(resetSchema, req.body);
    await auth.resetPassword(token, password);
    clearSessionCookie(reply);
    return reply.send({ status: "password_updated" });
  });

  app.get("/v1/auth/me", { preHandler: app.requireAuth }, async (req) => {
    return auth.me(requireAuthContext(req));
  });

  app.get("/v1/auth/csrf", { preHandler: app.requireAuth }, async (req, reply) => {
    const ctx = requireAuthContext(req);
    const token = peekCsrfToken(ctx.sessionId) ?? issueCsrfToken(ctx.sessionId);
    reply.setCookie(csrfName, token, {
      httpOnly: false,
      secure: app.config.isProd,
      sameSite: "lax",
      path: "/",
    });
    return { csrfToken: token };
  });

  app.post("/v1/me/password", { preHandler: app.requireAuth, ...limit }, async (req, reply) => {
    const body = parseStrict(setPasswordBody, req.body);
    await auth.setPassword(requireAuthContext(req).user.id, body);
    return reply.send({ status: "password_updated" });
  });

  app.get("/v1/me/referral", { preHandler: app.requireAuth }, async (req) => {
    return auth.getReferral(requireAuthContext(req).user.id);
  });

  app.post("/v1/me/referral", { preHandler: app.requireAuth, ...limit }, async (req) => {
    const raw = parseStrict(
      z.object({
        code: z.string().trim().max(32).optional(),
        shareProgressWithConsultancy: z.boolean().optional(),
      }),
      req.body,
    );
    const code =
      raw.code && raw.code.length > 0 ? referralCodeSchema.parse(raw.code) : undefined;
    const ctx = requireAuthContext(req);
    return auth.applyReferral(
      ctx.user.id,
      { code, shareProgressWithConsultancy: raw.shareProgressWithConsultancy },
      { ip: req.ip, userAgent: req.headers["user-agent"] },
    );
  });

  app.post("/v1/me/deletion-request", { preHandler: app.requireAuth, ...limit }, async (req, reply) => {
    const body = parseStrict(deletionSchema, req.body);
    const res = await auth.requestDeletion(requireAuthContext(req).user.id, body);
    return reply.code(202).send({ status: res.created ? "requested" : "already_requested" });
  });

  app.get("/v1/auth/google/status", async () => ({
    enabled: googleOAuthEnabled(app.config),
    clientId: app.config.GOOGLE_CLIENT_ID ?? null,
  }));

  /** GIS sign-in via idToken or accessToken (custom themed button). */
  app.post("/v1/auth/google", limit, async (req, reply) => {
    const clientId = app.config.GOOGLE_CLIENT_ID;
    if (!clientId || !googleOAuthEnabled(app.config)) {
      throw new AppError("INTERNAL", "Google sign-in is not configured.");
    }
    const body = parseStrict(
      z.object({
        idToken: z.string().min(20).max(4096).optional(),
        accessToken: z.string().min(20).max(8192).optional(),
        ref: z.string().max(32).optional(),
        terms: z.string().max(40).optional(),
        privacy: z.string().max(40).optional(),
        shareProgressWithConsultancy: z.boolean().optional(),
      }),
      req.body,
    );
    if (!body.idToken && !body.accessToken) {
      throw new AppError("VALIDATION_FAILED", "Google credential missing.");
    }
    let profile;
    try {
      profile = body.idToken
        ? await verifyGoogleIdToken(body.idToken, clientId)
        : await profileFromGoogleAccessToken(body.accessToken!);
    } catch {
      throw new AppError("AUTH_INVALID_CREDENTIALS", "Google sign-in failed. Try again.");
    }
    const { user, sessionToken, expiresAt } = await auth.loginWithGoogle(
      profile,
      {
        referralCode: body.ref ?? null,
        termsVersion: body.terms ?? null,
        privacyVersion: body.privacy ?? null,
        shareProgressWithConsultancy: body.shareProgressWithConsultancy === true,
      },
      { ip: req.ip, userAgent: req.headers["user-agent"] },
    );
    const { hashToken } = await import("../../lib/tokens.js");
    setSessionCookie(reply, sessionToken, expiresAt, hashToken(sessionToken));
    return reply.send({ user: { id: user.id, fullName: user.fullName, role: user.role } });
  });

  app.get("/v1/auth/google", limit, async (req, reply) => {
    const clientId = app.config.GOOGLE_CLIENT_ID;
    const clientSecret = app.config.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new AppError("INTERNAL", "Google sign-in is not configured.");
    }
    const q = parseStrict(oauthStartQuery, req.query);
    const state = newOAuthState();
    const payload: OAuthStateCookie = {
      state,
      next: safeNextPath(q.next),
      ref: q.ref,
      terms: q.terms,
      privacy: q.privacy,
      share: q.share === true,
    };
    reply.setCookie(OAUTH_STATE_COOKIE, JSON.stringify(payload), {
      httpOnly: true,
      secure: app.config.isProd,
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });
    const url = buildGoogleAuthorizeUrl(
      {
        clientId,
        clientSecret,
        redirectUri: app.config.GOOGLE_REDIRECT_URI,
      },
      state,
    );
    return reply.redirect(url);
  });

  app.get("/v1/auth/google/callback", limit, async (req, reply) => {
    const web = app.config.APP_URL.replace(/\/$/, "");
    const fail = (code: string) => reply.redirect(`${web}/login?oauth=error&reason=${encodeURIComponent(code)}`);

    const clientId = app.config.GOOGLE_CLIENT_ID;
    const clientSecret = app.config.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return fail("not_configured");
    }

    const query = req.query as { code?: string; state?: string; error?: string };
    if (query.error) return fail(query.error);
    if (!query.code || !query.state) return fail("missing_code");

    let stored: OAuthStateCookie | null = null;
    try {
      const raw = req.cookies?.[OAUTH_STATE_COOKIE];
      stored = raw ? (JSON.parse(raw) as OAuthStateCookie) : null;
    } catch {
      stored = null;
    }
    reply.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });
    if (!stored?.state || stored.state !== query.state) return fail("invalid_state");

    try {
      const profile = await exchangeGoogleCode(
        {
          clientId,
          clientSecret,
          redirectUri: app.config.GOOGLE_REDIRECT_URI,
        },
        query.code,
      );
      const { user, sessionToken, expiresAt } = await auth.loginWithGoogle(
        profile,
        {
          referralCode: stored.ref ?? null,
          termsVersion: stored.terms ?? null,
          privacyVersion: stored.privacy ?? null,
          shareProgressWithConsultancy: stored.share === true,
        },
        { ip: req.ip, userAgent: req.headers["user-agent"] },
      );
      const { hashToken } = await import("../../lib/tokens.js");
      setSessionCookie(reply, sessionToken, expiresAt, hashToken(sessionToken));

      const profileRow = await app.services.repos.profiles.get(user.id);
      const dest =
        stored.next ??
        (user.role === "super_admin"
          ? "/admin/students"
          : user.role === "consultancy"
            ? "/consultancy/dashboard"
            : profileRow?.paymentStatus !== "paid"
              ? "/pay"
              : profileRow?.identityComplete
                ? "/dashboard"
                : "/onboarding/identity");
      return reply.redirect(`${web}${dest.startsWith("/") ? dest : `/${dest}`}`);
    } catch (err) {
      req.log.warn({ err }, "Google OAuth callback failed");
      return fail("exchange_failed");
    }
  });
}

function safeNextPath(next: string | undefined): string | undefined {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return undefined;
  return next.slice(0, 200);
}
