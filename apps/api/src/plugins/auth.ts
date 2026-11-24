import type { FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
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

export function sessionCookieName(isProd: boolean): string {
  // __Host- prefix: Secure, Path=/, no Domain — prevents subdomain cookie injection.
  return isProd ? "__Host-nivo_sid" : "nivo_sid";
}

/**
 * Session-cookie authentication. Resolves `req.auth` on every request, and applies a
 * CSRF defence for cookie-authenticated mutations: if an Origin header is present it
 * must be an allowed origin (browsers always send it on cross-site POSTs).
 */
export const authPlugin = fp(async (app) => {
  const cookieName = sessionCookieName(app.config.isProd);
  const allowed = new Set(app.config.corsOrigins);

  app.decorateRequest("auth", null);

  app.addHook("onRequest", async (req) => {
    const token = req.cookies?.[cookieName];
    if (!token) return;

    if (!SAFE_METHODS.has(req.method)) {
      const origin = req.headers.origin;
      if (origin && !allowed.has(origin)) {
        throw new AppError("FORBIDDEN", "Cross-origin request rejected.");
      }
    }
    req.auth = await app.services.auth.resolveSession(token);
  });

  app.decorate("requireAuth", async (req: FastifyRequest) => {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required.");
  });
});

export function requireAuthContext(req: FastifyRequest): AuthContext {
  if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required.");
  return req.auth;
}
