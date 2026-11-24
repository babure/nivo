import type { FastifyInstance, FastifyReply } from "fastify";
import { emailSchema, passwordSchema, registerSchema } from "@nivo/shared";
import { z } from "zod";
import { parseStrict } from "../../lib/errors.js";
import { requireAuthContext, sessionCookieName } from "../../plugins/auth.js";
import { SESSION_TTL_MS } from "./service.js";

const loginSchema = z.object({
  email: emailSchema,
  // do not apply strength rules at login (legacy passwords must still be able to sign in)
  password: z.string().min(1).max(128),
  totp: z.string().regex(/^\d{6}$/).optional(),
});
const tokenSchema = z.object({ token: z.string().min(20).max(200) });
const forgotSchema = z.object({ email: emailSchema });
const resetSchema = z.object({ token: z.string().min(20).max(200), password: passwordSchema });
const totpEnableSchema = z.object({ secret: z.string().min(16).max(64), code: z.string().regex(/^\d{6}$/) });
const deletionSchema = z.object({ password: z.string().min(1).max(128) });

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const { auth } = app.services;
  const cookieName = sessionCookieName(app.config.isProd);
  const limit = {
    config: { rateLimit: { max: app.config.AUTH_RATE_LIMIT_MAX, timeWindow: "1 minute" } },
  };

  const setSessionCookie = (reply: FastifyReply, token: string, expiresAt: Date) => {
    reply.setCookie(cookieName, token, {
      httpOnly: true,
      secure: app.config.isProd,
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });
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
    setSessionCookie(reply, sessionToken, expiresAt);
    return reply.send({ user: { id: user.id, fullName: user.fullName, role: user.role } });
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

  app.post("/v1/auth/2fa/setup", { preHandler: app.requireAuth, ...limit }, async (req) => {
    return auth.beginTotpSetup(requireAuthContext(req).user.id);
  });

  app.post("/v1/auth/2fa/enable", { preHandler: app.requireAuth, ...limit }, async (req, reply) => {
    const { secret, code } = parseStrict(totpEnableSchema, req.body);
    await auth.enableTotp(requireAuthContext(req).user.id, secret, code);
    return reply.send({ status: "enabled" });
  });

  app.post("/v1/me/deletion-request", { preHandler: app.requireAuth, ...limit }, async (req, reply) => {
    const { password } = parseStrict(deletionSchema, req.body);
    const res = await auth.requestDeletion(requireAuthContext(req).user.id, password);
    return reply.code(202).send({ status: res.created ? "requested" : "already_requested" });
  });
}
