import helmet from "@fastify/helmet";
import fp from "fastify-plugin";

/**
 * Strict headers for a JSON-only API: no content may be rendered, framed or sniffed,
 * and responses (which may contain personal data) are never cached.
 */
export const securityHeaders = fp(async (app) => {
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    hsts: { maxAge: 63_072_000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: "no-referrer" },
    crossOriginResourcePolicy: { policy: "same-site" },
    crossOriginOpenerPolicy: { policy: "same-origin" },
    frameguard: { action: "deny" },
    xPoweredBy: false,
  });

  app.addHook("onSend", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    reply.header("X-Request-Id", req.id);
  });
});
