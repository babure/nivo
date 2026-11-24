import type { FastifyInstance } from "fastify";
import Stripe from "stripe";
import { z } from "zod";
import { SERVICE_CURRENCY, SERVICE_FEE_CENTS } from "@nivo/shared";
import { AppError, parseStrict } from "../../lib/errors.js";
import { requireAuthContext } from "../../plugins/auth.js";
import type { PaymentEvent } from "./service.js";

const confirmSessionBody = z.object({
  sessionId: z.string().min(1).max(200),
});

export type StripeEventVerifier = (rawBody: Buffer, signature: string) => PaymentEvent;

export function createStripeVerifier(secretKey: string | undefined, webhookSecret: string): StripeEventVerifier {
  // The key is not needed to verify signatures, only to call the Stripe API.
  const stripe = new Stripe(secretKey ?? "sk_unused_for_webhook_verification");
  return (rawBody, signature) => {
    try {
      return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret) as unknown as PaymentEvent;
    } catch {
      throw new AppError("VALIDATION_FAILED", "Invalid webhook signature.");
    }
  };
}

export type PaymentsRoutesOptions = {
  /** Override for tests. Defaults to real Stripe signature verification. */
  verifier?: StripeEventVerifier;
  /** Override for tests. Defaults to the Stripe API client. */
  createCheckoutSession?: (args: { userId: string; email: string }) => Promise<{ url: string }>;
};

export function paymentsRoutes(opts: PaymentsRoutesOptions = {}) {
  return async function register(app: FastifyInstance): Promise<void> {
    const { config, services } = app;

    // ── Stripe webhook: needs the exact raw bytes for signature verification.
    // Encapsulated so the buffer parser only applies to this route.
    await app.register(async (hook) => {
      hook.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => done(null, body));

      hook.post("/v1/webhooks/stripe", { config: { rateLimit: false } }, async (req, reply) => {
        const verifier =
          opts.verifier ??
          (config.STRIPE_WEBHOOK_SECRET
            ? createStripeVerifier(config.STRIPE_SECRET_KEY, config.STRIPE_WEBHOOK_SECRET)
            : null);
        if (!verifier) throw new AppError("INTERNAL", "Webhook not configured.");

        const signature = req.headers["stripe-signature"];
        if (typeof signature !== "string" || !Buffer.isBuffer(req.body)) {
          throw new AppError("VALIDATION_FAILED", "Missing webhook signature.");
        }
        const event = verifier(req.body, signature);
        const outcome = await services.payments.handleEvent(event);
        // 2xx for every handled outcome (incl. duplicates / rejections) so Stripe stops retrying.
        return reply.code(200).send({ received: true, outcome: outcome.status });
      });
    });

    const stripeApi = config.STRIPE_SECRET_KEY ? new Stripe(config.STRIPE_SECRET_KEY) : null;
    const createSession =
      opts.createCheckoutSession ??
      (stripeApi
        ? async ({ userId, email }: { userId: string; email: string }) => {
            const session = await stripeApi.checkout.sessions.create({
              mode: "payment",
              customer_email: email,
              client_reference_id: userId,
              metadata: { userId },
              payment_intent_data: { metadata: { userId } },
              line_items: [
                {
                  quantity: 1,
                  price_data: {
                    currency: SERVICE_CURRENCY,
                    unit_amount: SERVICE_FEE_CENTS,
                    product_data: { name: "NIVO service fee" },
                  },
                },
              ],
              success_url: `${config.APP_URL}/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}`,
              cancel_url: `${config.APP_URL}/pay?payment=cancelled`,
            });
            if (!session.url) throw new AppError("PAYMENT_FAILED", "Could not start checkout.");
            return { url: session.url };
          }
        : null);

    app.post("/v1/payments/checkout", { preHandler: app.requireAuth }, async (req, reply) => {
      const { user } = requireAuthContext(req);
      if (createSession) {
        await services.payments.markProcessing(user.id);
        const { url } = await createSession({ userId: user.id, email: user.email });
        return reply.send({ mode: "stripe" as const, url });
      }
      // Dev/demo: allow completing payment without Stripe keys.
      if (config.isProd) throw new AppError("INTERNAL", "Payments are not configured.");
      return reply.send({
        mode: "simulate" as const,
        amountCents: SERVICE_FEE_CENTS,
        currency: SERVICE_CURRENCY,
        message: "Stripe is not configured. Complete a demo payment to continue.",
      });
    });

    /**
     * After Stripe Checkout redirect, confirm the session without needing a webhook
     * (useful for local test mode). Still idempotent via payment event ids.
     */
    app.post("/v1/payments/confirm-session", { preHandler: app.requireAuth }, async (req) => {
      const { user } = requireAuthContext(req);
      const { sessionId } = parseStrict(confirmSessionBody, req.body);
      if (!stripeApi) throw new AppError("INTERNAL", "Payments are not configured.");

      const session = await stripeApi.checkout.sessions.retrieve(sessionId);
      const metaUser = session.metadata?.userId ?? session.client_reference_id;
      if (metaUser !== user.id) {
        throw new AppError("FORBIDDEN", "Checkout session does not belong to this account.");
      }
      if (session.payment_status !== "paid") {
        throw new AppError("PAYMENT_REQUIRED", "Checkout is not paid yet.");
      }

      const outcome = await services.payments.handleEvent({
        id: `confirm_${session.id}`,
        type: "checkout.session.completed",
        data: {
          object: {
            id: session.id,
            object: "checkout.session",
            payment_status: session.payment_status,
            amount_total: session.amount_total,
            currency: session.currency,
            client_reference_id: session.client_reference_id,
            metadata: session.metadata ?? { userId: user.id },
          },
        },
      });

      return { status: "ok", outcome: outcome.status };
    });

    app.post("/v1/payments/simulate", { preHandler: app.requireAuth }, async (req, reply) => {
      if (config.isProd) throw new AppError("FORBIDDEN", "Demo payment is not available in production.");
      const { user } = requireAuthContext(req);
      await services.payments.markPaidManually(
        user.id,
        user.id,
        "Dev/demo simulate payment (Stripe not configured).",
      );
      return reply.send({ status: "paid", mode: "simulate" as const });
    });

    app.get("/v1/payments/status", { preHandler: app.requireAuth }, async (req) => {
      return services.payments.status(requireAuthContext(req).user.id);
    });
  };
}
