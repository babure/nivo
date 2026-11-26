import type { FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import {
  csrfCookieName,
  issueCsrfToken,
  peekCsrfToken,
  verifyCsrfToken,
} from "../lib/csrf.js";
import { AppError } from "../lib/errors.js";
import type { AuthContext } from "../modules/auth/service.js";

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
/** Webhook and health paths skip CSRF (no session cookie / machine callers). */
const CSRF_SKIP_PREFIXES = ["/v1/webhooks/", "/health"];

export function sessionCookieName(isProd: boolean): string {
  // __Host- prefix: Secure, Path=/, no Domain — prevents subdomain cookie injection.
  return isProd ? "__Host-nivo_sid" : "nivo_sid";
}

function csrfExempt(url: string): boolean {
  return CSRF_SKIP_PREFIXES.some((p) => url.startsWith(p));
}

/**
 * Session-cookie authentication. Resolves `req.auth` on every request, and applies
 * Origin allow-list + synchroniser CSRF (cookie + X-CSRF-Token) for mutations.
 */
export const authPlugin = fp(async (app) => {
  const cookieName = sessionCookieName(app.config.isProd);
  const csrfName = csrfCookieName(app.config.isProd);
  const allowed = new Set(app.config.corsOrigins);

  app.decorateRequest("auth", null);

  app.addHook("onRequest", async (req, reply) => {
    const token = req.cookies?.[cookieName];
    if (!token) return;

    if (!SAFE_METHODS.has(req.method)) {
      const origin = req.headers.origin;
      if (origin && !allowed.has(origin)) {
        throw new AppError("FORBIDDEN", "Cross-origin request rejected.");
      }
    }

    req.auth = await app.services.auth.resolveSession(token);
    if (!req.auth) return;

    let csrf = peekCsrfToken(req.auth.sessionId);
    if (!csrf) {
      csrf = issueCsrfToken(req.auth.sessionId);
    }
    reply.setCookie(csrfName, csrf, {
      httpOnly: false,
      secure: app.config.isProd,
      sameSite: "lax",
      path: "/",
    });

    const skipCsrfVerify = app.config.isTest || process.env.ALLOW_INSECURE_CSRF === "true";
    if (
      !skipCsrfVerify &&
      !SAFE_METHODS.has(req.method) &&
      !csrfExempt(req.url.split("?")[0] ?? req.url)
    ) {
      const header = req.headers["x-csrf-token"];
      const presented = typeof header === "string" ? header : undefined;
      const cookieTok = req.cookies?.[csrfName];
      if (!verifyCsrfToken(req.auth.sessionId, presented) && !verifyCsrfToken(req.auth.sessionId, cookieTok)) {
        throw new AppError("CSRF_INVALID", "Missing or invalid CSRF token.");
      }
    }
  });

  app.decorate("requireAuth", async (req: FastifyRequest) => {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required.");
  });
});

export function requireAuthContext(req: FastifyRequest): AuthContext {
  if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required.");
  return req.auth;
}
