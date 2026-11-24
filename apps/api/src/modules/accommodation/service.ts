import { randomUUID } from "node:crypto";
import type { AuditLogger } from "../../lib/audit.js";
import { AppError } from "../../lib/errors.js";
import type { LeadStatus, Repositories } from "../../repositories/types.js";

export class AccommodationService {
  constructor(
    private readonly deps: {
      repos: Repositories;
      audit: AuditLogger;
      notifyEmail?: (to: string, template: string) => Promise<void>;
    },
  ) {}

  async submit(
    userId: string,
    input: { city: string; budget: string; roomType: string; phone: string; notes?: string },
  ): Promise<{ id: string; status: "new" }> {
    const profile = await this.deps.repos.profiles.get(userId);
    if (profile?.paymentStatus !== "paid") {
      throw new AppError("PAYMENT_REQUIRED", "Complete payment to continue.");
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
    const notifyTo = await this.deps.repos.settings.get<string>("accommodation.notify_email");
    if (notifyTo) await this.deps.notifyEmail?.(notifyTo, "accommodation_lead");
    await this.deps.audit.append({
      actorId: userId,
      action: "lead.created",
      entityType: "lead",
      entityId: id,
    });
    return { id, status: "new" };
  }

  async updateStatus(agentId: string, leadId: string, status: LeadStatus): Promise<void> {
    await this.deps.repos.leads.updateStatus(leadId, status, new Date());
    await this.deps.audit.append({
      actorId: agentId,
      action: "lead.status",
      entityType: "lead",
      entityId: leadId,
      meta: { status },
    });
  }
}
