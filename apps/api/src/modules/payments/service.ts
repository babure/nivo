import { randomUUID } from "node:crypto";
import { SERVICE_CURRENCY, SERVICE_FEE_CENTS } from "@nivo/shared";
import type { AuditLogger } from "../../lib/audit.js";
import { AppError } from "../../lib/errors.js";
import type { Repositories } from "../../repositories/types.js";
import type { CardsService } from "../cards/service.js";

/** Minimal shape of a verified Stripe event (decoupled from the Stripe SDK types). */
export type PaymentEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

export type WebhookOutcome =
  | { status: "processed"; paymentId: string; invoiceNumber: string }
  | { status: "duplicate" }
  | { status: "already_paid" }
  | { status: "ignored"; reason: string }
  | { status: "rejected"; reason: "amount_mismatch" | "currency_mismatch" | "not_paid" };

/** Event types that can carry a successful payment for the service fee. */
const PAID_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "payment_intent.succeeded",
]);

type Extracted = {
  userId: string | undefined;
  amount: number | undefined;
  currency: string | undefined;
  paid: boolean;
  providerRef: string | undefined;
};

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export function extractPayment(event: PaymentEvent): Extracted {
  const o = event.data.object;
  const metadata = (o.metadata ?? {}) as Record<string, unknown>;
  const userId = str(metadata.userId) ?? str(o.client_reference_id);

  if (event.type.startsWith("checkout.session.")) {
    return {
      userId,
      amount: num(o.amount_total),
      currency: str(o.currency)?.toLowerCase(),
      paid: o.payment_status === "paid",
      providerRef: str(o.id),
    };
  }
  // payment_intent.succeeded
  return {
    userId,
    amount: num(o.amount_received) ?? num(o.amount),
    currency: str(o.currency)?.toLowerCase(),
    paid: o.status === "succeeded",
    providerRef: str(o.id),
  };
}

export class PaymentsService {
  private readonly now: () => Date;

  constructor(
    private readonly deps: {
      repos: Repositories;
      audit: AuditLogger;
      cards: CardsService;
      now?: () => Date;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * Idempotent by Stripe event id. Only a payment of exactly EUR 149.00 marks the user paid.
   * Anything unexpected returns a non-throwing outcome (HTTP 200 to Stripe, no retry storm),
   * while real failures throw after releasing the claim so Stripe retries.
   */
  async handleEvent(event: PaymentEvent): Promise<WebhookOutcome> {
    const { repos } = this.deps;

    const claimed = await repos.payments.claimEvent(event.id, event.type);
    if (!claimed) return { status: "duplicate" };

    try {
      const outcome = await this.process(event);
      await repos.payments.setEventOutcome(event.id, outcome.status);
      return outcome;
    } catch (err) {
      await repos.payments.releaseEvent(event.id);
      throw err;
    }
  }

  private async process(event: PaymentEvent): Promise<WebhookOutcome> {
    const { repos, audit } = this.deps;

    if (!PAID_EVENT_TYPES.has(event.type)) {
      return { status: "ignored", reason: "unhandled_event_type" };
    }

    const p = extractPayment(event);
    if (!p.userId) return { status: "ignored", reason: "missing_user_reference" };

    const user = await repos.users.findById(p.userId);
    const profile = user ? await repos.profiles.get(user.id) : null;
    if (!user || !profile) return { status: "ignored", reason: "unknown_user" };

    if (!p.paid) {
      return { status: "rejected", reason: "not_paid" };
    }
    if (p.amount !== SERVICE_FEE_CENTS) {
      await audit.append({
        actorId: null,
        action: "payments.amount_mismatch",
        entityType: "user",
        entityId: user.id,
        meta: { eventId: event.id, expected: SERVICE_FEE_CENTS, received: p.amount ?? null },
      });
      return { status: "rejected", reason: "amount_mismatch" };
    }
    if (p.currency !== SERVICE_CURRENCY) {
      await audit.append({
        actorId: null,
        action: "payments.currency_mismatch",
        entityType: "user",
        entityId: user.id,
        meta: { eventId: event.id, received: p.currency ?? null },
      });
      return { status: "rejected", reason: "currency_mismatch" };
    }

    if (profile.paymentStatus === "paid") {
      // A second, different event for an already-paid user: record, never double-invoice.
      await audit.append({
        actorId: null,
        action: "payments.duplicate_payment",
        entityType: "user",
        entityId: user.id,
        meta: { eventId: event.id, providerRef: p.providerRef ?? null },
      });
      return { status: "already_paid" };
    }

    const now = this.now();
    const paymentId = randomUUID();
    await repos.payments.createPayment({
      id: paymentId,
      userId: user.id,
      provider: "stripe",
      providerRef: p.providerRef ?? null,
      amountCents: SERVICE_FEE_CENTS,
      currency: SERVICE_CURRENCY,
      status: "paid",
      stripeEventId: event.id,
      createdAt: now,
      paidAt: now,
    });
    const invoiceNumber = await repos.payments.nextInvoiceNumber(now.getUTCFullYear());
    await repos.payments.createInvoice({
      id: randomUUID(),
      number: invoiceNumber,
      userId: user.id,
      paymentId,
      amountCents: SERVICE_FEE_CENTS,
      currency: SERVICE_CURRENCY,
      issuedAt: now,
    });
    await repos.profiles.patch(user.id, { paymentStatus: "paid", paidAt: now });
    await audit.append({
      actorId: null,
      action: "payments.paid",
      entityType: "user",
      entityId: user.id,
      meta: { eventId: event.id, paymentId, invoiceNumber },
    });
    await this.deps.cards.syncSim(user.id);
    return { status: "processed", paymentId, invoiceNumber };
  }

  /** Marks the user as awaiting payment (called when a checkout session is created). */
  async markProcessing(userId: string): Promise<void> {
    const profile = await this.deps.repos.profiles.get(userId);
    if (!profile) throw new AppError("NOT_FOUND", "Profile not found.");
    if (profile.paymentStatus === "paid") {
      throw new AppError("CONFLICT", "Service fee already paid.");
    }
    await this.deps.repos.profiles.patch(userId, { paymentStatus: "processing" });
  }

  async status(userId: string) {
    const [profile, payments, invoices] = await Promise.all([
      this.deps.repos.profiles.get(userId),
      this.deps.repos.payments.listForUser(userId),
      this.deps.repos.payments.listInvoicesForUser(userId),
    ]);
    return {
      status: profile?.paymentStatus ?? "unpaid",
      amountCents: SERVICE_FEE_CENTS,
      currency: SERVICE_CURRENCY,
      paidAt: profile?.paidAt ?? null,
      invoices: invoices.map((i) => ({ number: i.number, issuedAt: i.issuedAt })),
      payments: payments.length,
    };
  }

  /** Admin manual override (maker-checker is enforced at the route layer via permissions + audit). */
  async markPaidManually(userId: string, actorId: string, reason: string): Promise<void> {
    const { repos, audit } = this.deps;
    const profile = await repos.profiles.get(userId);
    if (!profile) throw new AppError("NOT_FOUND", "Student not found.");
    if (profile.paymentStatus === "paid") throw new AppError("CONFLICT", "Already paid.");
    const now = this.now();
    await repos.payments.createPayment({
      id: randomUUID(),
      userId,
      provider: "manual",
      providerRef: null,
      amountCents: SERVICE_FEE_CENTS,
      currency: SERVICE_CURRENCY,
      status: "paid",
      stripeEventId: null,
      createdAt: now,
      paidAt: now,
    });
    await repos.profiles.patch(userId, { paymentStatus: "paid", paidAt: now });
    await audit.append({
      actorId,
      action: "payments.manual_mark_paid",
      entityType: "user",
      entityId: userId,
      meta: { reason },
    });
    await this.deps.cards.syncSim(userId);
  }
}
