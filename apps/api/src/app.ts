import { randomUUID } from "node:crypto";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { apiError, type ErrorCode } from "@nivo/shared";
import { loadConfig, type AppConfig } from "./config.js";
import { AppError, zodDetails } from "./lib/errors.js";
import { createLogger } from "./lib/logger.js";
import { SERVICE_CURRENCY, SERVICE_FEE_CENTS } from "@nivo/shared";
import Stripe from "stripe";
import { createMailer, type Mailer } from "./lib/mailer.js";
import { accommodationRoutes } from "./modules/accommodation/routes.js";
import { adminRoutes } from "./modules/admin/routes.js";
import { authRoutes } from "./modules/auth/routes.js";
import type { PasswordHasher } from "./modules/auth/service.js";
import { cardsRoutes } from "./modules/cards/routes.js";
import { consultancyRoutes } from "./modules/consultancy/routes.js";
import { healthRoutes, type HealthDeps } from "./modules/health/routes.js";
import { identityRoutes } from "./modules/identity/routes.js";
import { legalRoutes } from "./modules/legal/routes.js";
import { documentsRoutes } from "./modules/documents/routes.js";
import { partnersRoutes } from "./modules/partners/routes.js";
import { resolveCheckoutCharge } from "./modules/payments/charge-currency.js";
import { paymentsRoutes, type PaymentsRoutesOptions } from "./modules/payments/routes.js";
import { proofsRoutes } from "./modules/proofs/routes.js";
import { authPlugin } from "./plugins/auth.js";
import { securityHeaders } from "./plugins/security-headers.js";
import { InMemoryRepositories } from "./repositories/memory.js";
import type { Repositories } from "./repositories/types.js";
import { buildServices, type Services } from "./services.js";

declare module "fastify" {
  interface FastifyInstance {
    config: AppConfig;
    services: Services;
    /** Actual Stripe Checkout charge (settlement currency when Adaptive Pricing needs it). */
    checkoutFee: { amountCents: number; currency: string };
  }
}

export type BuildAppOptions = {
  config?: AppConfig;
  repos?: Repositories;
  mailer?: Mailer;
  hasher?: PasswordHasher;
  logger?: FastifyBaseLogger;
  now?: () => Date;
  health?: HealthDeps;
  payments?: PaymentsRoutesOptions;
};

export async function buildApp(opts: BuildAppOptions = {}) {
  const config = opts.config ?? loadConfig();
  const repos = opts.repos ?? new InMemoryRepositories();
  const mailer = opts.mailer ?? createMailer(config);
  const logger = opts.logger ?? createLogger(config.LOG_LEVEL);

  let feeCents = SERVICE_FEE_CENTS;
  let feeCurrency: string = SERVICE_CURRENCY;
  if (config.STRIPE_SECRET_KEY && !config.isTest) {
    try {
      const stripe = new Stripe(config.STRIPE_SECRET_KEY);
      const charge = await resolveCheckoutCharge(stripe, {
        overrideCurrency: config.STRIPE_CHARGE_CURRENCY,
        overrideAmountCents: config.STRIPE_CHARGE_AMOUNT_CENTS,
      });
      feeCents = charge.amountCents;
      feeCurrency = charge.currency;
      if (charge.reason !== "product_eur") {
        logger.warn(
          { feeCurrency, feeCents, reason: charge.reason },
          "Adaptive Pricing: charging in Stripe settlement currency (list price remains EUR)",
        );
      }
    } catch (err) {
      logger.error({ err }, "Could not resolve Stripe charge currency; falling back to EUR");
    }
  }

  const app = Fastify({
    loggerInstance: logger,
    genReqId: () => randomUUID(),
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 1024 * 1024,
    // Unknown JSON keys are rejected by zod (.strict()); keep Fastify from silently
    // stripping __proto__ style payloads.
    onProtoPoisoning: "error",
    onConstructorPoisoning: "error",
  });

  app.decorate("config", config);
  app.decorate("checkoutFee", { amountCents: feeCents, currency: feeCurrency });
  app.decorate(
    "services",
    buildServices({
      config,
      repos,
      mailer,
      hasher: opts.hasher,
      now: opts.now,
      feeCents,
      feeCurrency,
    }),
  );

  // ── error envelope: { error: { code, message, requestId, details } }
  app.setErrorHandler((err, req, reply) => {
    let code: ErrorCode = "INTERNAL";
    let status = 500;
    let message = "Something went wrong.";
    let details: unknown[] = [];

    if (err instanceof AppError) {
      code = err.code;
      status = err.statusCode;
      message = err.message;
      details = err.details;
    } else if (err instanceof ZodError) {
      code = "VALIDATION_FAILED";
      status = 400;
      message = "Request validation failed.";
      details = zodDetails(err);
    } else {
      const e = err as { statusCode?: number; code?: string };
      if (e.statusCode === 429) {
        code = "RATE_LIMITED";
        status = 429;
        message = "Too many requests. Please slow down.";
      } else if (typeof e.statusCode === "number" && e.statusCode >= 400 && e.statusCode < 500) {
        code = "VALIDATION_FAILED";
        status = e.statusCode;
        message = e.statusCode === 413 ? "Payload too large." : "Malformed request.";
      }
    }

    if (status >= 500) req.log.error({ err }, "unhandled error");
    else req.log.info({ code, status }, "request rejected");

    return reply.code(status).send(apiError(code, message, req.id, details));
  });

  app.setNotFoundHandler((req, reply) =>
    reply.code(404).send(apiError("NOT_FOUND", "Route not found.", req.id)),
  );

  // ── plugins (order matters: security → cookies → CORS → rate limit → auth)
  await app.register(securityHeaders);
  await app.register(cookie);
  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    maxAge: 600,
  });
  await app.register(rateLimit, {
    global: true,
    max: config.RATE_LIMIT_MAX,
    timeWindow: "1 minute",
    allowList: (req) => req.url === "/health",
    errorResponseBuilder: () => new AppError("RATE_LIMITED", "Too many requests. Please slow down."),
  });
  await app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 2 },
  });
  await app.register(authPlugin);

  // ── routes
  await app.register(healthRoutes(opts.health));
  await app.register(authRoutes);
  await app.register(paymentsRoutes(opts.payments));
  await app.register(cardsRoutes);
  await app.register(identityRoutes);
  await app.register(legalRoutes);
  await app.register(adminRoutes);
  await app.register(proofsRoutes);
  await app.register(documentsRoutes);
  await app.register(consultancyRoutes);
  await app.register(accommodationRoutes);
  await app.register(partnersRoutes);

  return app;
}
