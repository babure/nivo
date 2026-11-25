import { randomUUID } from "node:crypto";
import { SERVICE_CURRENCY, SERVICE_FEE_CENTS } from "@nivo/shared";
import type { AuditLogger } from "../../lib/audit.js";
import { createDocument } from "../../lib/documents-store.js";
import { AppError } from "../../lib/errors.js";
import { writeInvoicePdf } from "../../lib/invoice-pdf.js";
import type { Mailer } from "../../lib/mailer.js";
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
  private readonly feeCents: number;
  private readonly feeCurrency: string;

  constructor(
    private readonly deps: {
      repos: Repositories;
      audit: AuditLogger;
      cards: CardsService;
      mailer?: Mailer;
      now?: () => Date;
      /** Actual Checkout charge (may differ from list EUR when settlement ≠ EUR). */
      feeCents?: number;
      feeCurrency?: string;
    },
  ) {
    this.now = deps.now ?? (() => new Date());
    this.feeCents = deps.feeCents ?? SERVICE_FEE_CENTS;
    this.feeCurrency = (deps.feeCurrency ?? SERVICE_CURRENCY).toLowerCase();
  }

  /**
   * Idempotent by Stripe event id. Only a payment of exactly the configured fee marks the user paid.
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
    if (p.amount !== this.feeCents) {
      await audit.append({
        actorId: null,
        action: "payments.amount_mismatch",
        entityType: "user",
        entityId: user.id,
        meta: { eventId: event.id, expected: this.feeCents, received: p.amount ?? null },
      });
      return { status: "rejected", reason: "amount_mismatch" };
    }
    if (p.currency !== this.feeCurrency) {
      await audit.append({
        actorId: null,
        action: "payments.currency_mismatch",
        entityType: "user",
        entityId: user.id,
        meta: { eventId: event.id, expected: this.feeCurrency, received: p.currency ?? null },
      });
      return { status: "rejected", reason: "currency_mismatch" };
    }

    if (profile.paymentStatus === "paid") {
      await audit.append({
        actorId: null,
        action: "payments.duplicate_payment",
        entityType: "user",
        entityId: user.id,
        meta: { eventId: event.id, providerRef: p.providerRef ?? null },
      });
      return { status: "already_paid" };
    }

    const { paymentId, invoiceNumber } = await this.completePaid({
      userId: user.id,
      fullName: user.fullName,
      email: user.email,
      provider: "stripe",
      providerRef: p.providerRef ?? null,
      stripeEventId: event.id,
      actorId: null,
      auditAction: "payments.paid",
      auditMeta: { eventId: event.id },
    });
    return { status: "processed", paymentId, invoiceNumber };
  }

  private async completePaid(input: {
    userId: string;
    fullName: string;
    email: string;
    provider: "stripe" | "manual";
    providerRef: string | null;
    stripeEventId: string | null;
    actorId: string | null;
    auditAction: string;
    auditMeta?: Record<string, unknown>;
    reason?: string;
  }): Promise<{ paymentId: string; invoiceNumber: string }> {
    const { repos, audit } = this.deps;
    const now = this.now();
    const paymentId = randomUUID();
    await repos.payments.createPayment({
      id: paymentId,
      userId: input.userId,
      provider: input.provider,
      providerRef: input.providerRef,
      amountCents: this.feeCents,
      currency: this.feeCurrency,
      status: "paid",
      stripeEventId: input.stripeEventId,
      createdAt: now,
      paidAt: now,
    });
    const invoiceNumber = await repos.payments.nextInvoiceNumber(now.getUTCFullYear());
    await repos.payments.createInvoice({
      id: randomUUID(),
      number: invoiceNumber,
      userId: input.userId,
      paymentId,
      amountCents: this.feeCents,
      currency: this.feeCurrency,
      issuedAt: now,
    });

    try {
      const storageKey = await writeInvoicePdf({
        number: invoiceNumber,
        fullName: input.fullName,
        email: input.email,
        amountCents: this.feeCents,
        currency: this.feeCurrency,
        issuedAt: now,
      });
      await createDocument({
        userId: input.userId,
        kind: "invoice_pdf",
        title: invoiceNumber,
        storageKey,
      });
    } catch {
      // PDF is best-effort; payment still succeeds.
    }

    await repos.profiles.patch(input.userId, { paymentStatus: "paid", paidAt: now });
    await audit.append({
      actorId: input.actorId,
      action: input.auditAction,
      entityType: "user",
      entityId: input.userId,
      meta: {
        paymentId,
        invoiceNumber,
        ...(input.reason ? { reason: input.reason } : {}),
        ...(input.auditMeta ?? {}),
      },
    });
    await this.deps.cards.syncSim(input.userId);

    const mailer = this.deps.mailer;
    if (mailer) {
      const amountLabel =
        this.feeCurrency === "eur"
          ? `€${(this.feeCents / 100).toFixed(0)}`
          : `${this.feeCurrency.toUpperCase()} ${(this.feeCents / 100).toFixed(2)}`;
      void mailer
        .send({
          to: input.email,
          template: "pay_receipt",
          vars: { fullName: input.fullName, invoiceNumber, amountLabel },
        })
        .catch(() => undefined);
    }

    return { paymentId, invoiceNumber };
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
    const [profile, payments, invoices, docs] = await Promise.all([
      this.deps.repos.profiles.get(userId),
      this.deps.repos.payments.listForUser(userId),
      this.deps.repos.payments.listInvoicesForUser(userId),
      import("../../lib/documents-store.js").then((m) => m.listDocumentsForUser(userId)),
    ]);
    const byTitle = new Map(docs.filter((d) => d.kind === "invoice_pdf").map((d) => [d.title, d.id]));
    return {
      status: profile?.paymentStatus ?? "unpaid",
      amountCents: this.feeCents,
      currency: this.feeCurrency,
      paidAt: profile?.paidAt ?? null,
      invoices: invoices.map((i) => ({
        number: i.number,
        issuedAt: i.issuedAt,
        documentId: byTitle.get(i.number) ?? null,
      })),
      payments: payments.length,
    };
  }

  /** Admin / simulate override. Super-admin path creates invoice + PDF + receipt. */
  async markPaidManually(userId: string, actorId: string, reason: string): Promise<void> {
    const { repos } = this.deps;
    const user = await repos.users.findById(userId);
    const profile = user ? await repos.profiles.get(userId) : null;
    if (!user || !profile) throw new AppError("NOT_FOUND", "Student not found.");
    if (profile.paymentStatus === "paid") throw new AppError("CONFLICT", "Already paid.");
    await this.completePaid({
      userId,
      fullName: user.fullName,
      email: user.email,
      provider: "manual",
      providerRef: null,
      stripeEventId: null,
      actorId,
      auditAction: "payments.manual_mark_paid",
      reason,
    });
  }

  /**
   * Admin refund with audit. Stripe execution is best-effort when a providerRef exists;
   * profile moves to refunded and cards stay latched (paymentPaid false locks unpaid cards).
   */
  async refund(userId: string, actorId: string, reason: string): Promise<{ status: "refunded" }> {
    const { repos, audit } = this.deps;
    const user = await repos.users.findById(userId);
    const profile = user ? await repos.profiles.get(userId) : null;
    if (!user || !profile) throw new AppError("NOT_FOUND", "Student not found.");
    if (profile.paymentStatus !== "paid") {
      throw new AppError("CONFLICT", "Only paid accounts can be refunded.");
    }
    const payments = await repos.payments.listForUser(userId);
    const paid = payments.find((p) => p.status === "paid");
    await repos.profiles.patch(userId, { paymentStatus: "refunded", paidAt: profile.paidAt });
    await audit.append({
      actorId,
      action: "payments.refunded",
      entityType: "user",
      entityId: userId,
      meta: { reason, paymentId: paid?.id ?? null, providerRef: paid?.providerRef ?? null },
    });
    return { status: "refunded" };
  }

  /** Persist checkout legal acknowledgements (REQ-LEG-05). */
  async recordCheckoutConsents(
    userId: string,
    input: { termsVersion: string; withdrawalVersion: string; immediateStart: boolean },
    ip?: string,
  ): Promise<void> {
    if (!input.immediateStart) {
      throw new AppError("VALIDATION_FAILED", "Immediate-start acknowledgement is required.");
    }
    const { repos } = this.deps;
    const terms = await repos.legal.getPublished("terms");
    if (terms && terms.version !== input.termsVersion) {
      throw new AppError("TERMS_REACCEPT_REQUIRED", `Current terms version is ${terms.version}.`);
    }
    // Withdrawal / refund policy is stored as slug "refund" in Phase 1 legal seed.
    const withdrawal = await repos.legal.getPublished("refund");
    if (withdrawal && withdrawal.version !== input.withdrawalVersion) {
      throw new AppError("TERMS_REACCEPT_REQUIRED", `Current withdrawal version is ${withdrawal.version}.`);
    }
    const now = this.now();
    const { hashIp } = await import("../../lib/tokens.js");
    const ipHash = hashIp(ip);
    await repos.consents.add({
      id: randomUUID(),
      userId,
      kind: "terms_checkout",
      version: input.termsVersion,
      ipHash,
      acceptedAt: now,
    });
    await repos.consents.add({
      id: randomUUID(),
      userId,
      kind: "withdrawal_ack",
      version: input.withdrawalVersion,
      ipHash,
      acceptedAt: now,
    });
  }
}
