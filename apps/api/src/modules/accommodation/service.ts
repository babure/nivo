import { randomUUID } from "node:crypto";
import type { AuditLogger } from "../../lib/audit.js";
import { AppError } from "../../lib/errors.js";
import type { Mailer } from "../../lib/mailer.js";
import type { LeadRecord, LeadStatus, Repositories } from "../../repositories/types.js";
import type { CardsService } from "../cards/service.js";

export const ACCOMMODATION_NOTIFY_SETTING = "accommodation.notify_email";
/** Alias used in some seed/docs copy. */
export const ACCOMMODATION_NOTIFY_ALIASES = ["roshan.email", ACCOMMODATION_NOTIFY_SETTING] as const;

export class AccommodationService {
  constructor(
    private readonly deps: {
      repos: Repositories;
      audit: AuditLogger;
      mailer?: Mailer;
      cards?: CardsService;
    },
  ) {}

  private async resolveNotifyEmail(): Promise<string | null> {
    for (const key of ACCOMMODATION_NOTIFY_ALIASES) {
      const v = await this.deps.repos.settings.get<string>(key);
      if (typeof v === "string" && v.includes("@")) return v;
    }
    return null;
  }

  async submit(
    userId: string,
    input: { city: string; budget: string; roomType: string; phone: string; notes?: string },
  ): Promise<{ id: string; status: "new" }> {
    const profile = await this.deps.repos.profiles.get(userId);
    if (profile?.paymentStatus !== "paid") {
      throw new AppError("PAYMENT_REQUIRED", "Complete payment to continue.");
    }
    if (!profile.identityComplete) {
      throw new AppError("IDENTITY_INCOMPLETE", "Complete identity onboarding first.");
    }
    const id = randomUUID();
    const now = new Date();
    await this.deps.repos.leads.create({
      id,
      userId,
      status: "new",
      city: input.city,
      budget: input.budget,
      roomType: input.roomType,
      notes: input.notes ?? "",
      phone: input.phone,
      createdAt: now,
      updatedAt: now,
    });

    const user = await this.deps.repos.users.findById(userId);
    const notifyTo = await this.resolveNotifyEmail();
    const mailer = this.deps.mailer;
    if (mailer && notifyTo) {
      void mailer
        .send({ to: notifyTo, template: "accommodation_lead", vars: { city: input.city, leadId: id } })
        .catch(() => undefined);
    }
    if (mailer && user) {
      void mailer
        .send({
          to: user.email,
          template: "accommodation_enquiry_received",
          vars: { fullName: user.fullName },
        })
        .catch(() => undefined);
    }

    await this.deps.audit.append({
      actorId: userId,
      action: "lead.created",
      entityType: "lead",
      entityId: id,
    });
    return { id, status: "new" };
  }

  async listMine(userId: string): Promise<LeadRecord[]> {
    return this.deps.repos.leads.listByUser(userId);
  }

  async withdraw(userId: string, leadId: string): Promise<LeadRecord> {
    const lead = await this.deps.repos.leads.get(leadId);
    if (!lead || lead.userId !== userId) throw new AppError("NOT_FOUND", "Lead not found.");
    if (lead.status === "closed" || lead.status === "booked") {
      throw new AppError("CONFLICT", "This enquiry can no longer be withdrawn.");
    }
    const updated = await this.deps.repos.leads.updateStatus(leadId, "closed", new Date());
    if (!updated) throw new AppError("NOT_FOUND", "Lead not found.");
    await this.deps.audit.append({
      actorId: userId,
      action: "lead.withdrawn",
      entityType: "lead",
      entityId: leadId,
    });
    return updated;
  }

  async updateStatus(agentId: string, leadId: string, status: LeadStatus): Promise<void> {
    const updated = await this.deps.repos.leads.updateStatus(leadId, status, new Date());
    if (!updated) throw new AppError("NOT_FOUND", "Lead not found.");
    await this.deps.audit.append({
      actorId: agentId,
      action: "lead.status",
      entityType: "lead",
      entityId: leadId,
      meta: { status },
    });
    // Provisional: agent marks Booked → Card 3 Completed + SIM eval (GAP-ACC-COMPLETE-TRIGGER).
    if (status === "booked" && this.deps.cards) {
      await this.deps.cards.setStatus(updated.userId, "accommodation", "completed", {
        actorId: agentId,
        bypassStudentLimits: true,
      });
    }
  }
}
