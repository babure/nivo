import {
  canTransition,
  dashboardCardAvailability,
  evaluateSimUnlock,
  simProgress,
  type CardProgress,
  type CardStatus,
} from "@nivo/shared";
import { AppError } from "../../lib/errors.js";
import type { AuditLogger } from "../../lib/audit.js";
import type { Repositories } from "../../repositories/types.js";

export const SIM_RULES_SETTING = "sim_unlock_rules";
/** Phase 1: SIM unlocks when Blocked Account is Completed (insurance added later via admin). */
export const DEFAULT_SIM_REQUIRED = ["blocked_account"];

export type CardView = {
  key: string;
  title: string;
  description: string;
  status: CardStatus;
  comingSoon: boolean;
  /** only for the SIM card */
  progress?: { done: number; total: number };
};

/** Statuses a student may set themselves (everything else is derived or admin-only). */
export const STUDENT_SETTABLE: readonly CardStatus[] = ["in_progress", "completed"];

export class CardsService {
  constructor(private readonly deps: { repos: Repositories; audit: AuditLogger }) {}

  async requiredForSim(): Promise<string[]> {
    const stored = await this.deps.repos.settings.get<string[]>(SIM_RULES_SETTING);
    return Array.isArray(stored) ? stored : DEFAULT_SIM_REQUIRED;
  }

  private async context(userId: string) {
    const { repos } = this.deps;
    const [profile, progress, defs, required] = await Promise.all([
      repos.profiles.get(userId),
      repos.cards.listProgress(userId),
      repos.cards.listDefinitions(),
      this.requiredForSim(),
    ]);
    return {
      paymentPaid: profile?.paymentStatus === "paid",
      identityComplete: profile?.identityComplete ?? false,
      progress: progress as CardProgress[],
      defs,
      required,
    };
  }

  /**
   * Persists SIM "available" the first time rules are satisfied so that later rule
   * changes never re-lock it (grandfathering, see evaluateSimUnlock).
   */
  async syncSim(userId: string): Promise<void> {
    const c = await this.context(userId);
    const stored = c.progress.find((p) => p.cardKey === "sim")?.status ?? "locked";
    const next = evaluateSimUnlock({
      paymentPaid: c.paymentPaid,
      identityComplete: c.identityComplete,
      requiredCardKeys: c.required,
      progress: c.progress,
      simStatus: stored,
    });
    if (next !== stored) {
      await this.deps.repos.cards.setProgress(userId, "sim", next);
    }
  }

  async list(userId: string): Promise<CardView[]> {
    await this.syncSim(userId);
    const c = await this.context(userId);
    return c.defs
      .sort((a, b) => a.position - b.position)
      .map((def) => {
        const status = dashboardCardAvailability({
          paymentPaid: c.paymentPaid,
          identityComplete: c.identityComplete,
          cardKey: def.key,
          requiredForSim: c.required,
          progress: c.progress,
          comingSoon: def.comingSoon,
        });
        const view: CardView = {
          key: def.key,
          title: def.title,
          description: def.description,
          status,
          comingSoon: def.comingSoon,
        };
        if (def.key === "sim") {
          view.progress = simProgress({ requiredCardKeys: c.required, progress: c.progress });
        }
        return view;
      });
  }

  async statusOf(userId: string, cardKey: string): Promise<CardView> {
    const card = (await this.list(userId)).find((v) => v.key === cardKey);
    if (!card) throw new AppError("NOT_FOUND", "Unknown card.");
    return card;
  }

  /** Student-driven transition. Server recomputes availability; client input is never trusted. */
  async setStatus(
    userId: string,
    cardKey: string,
    target: CardStatus,
    opts: { actorId?: string; bypassStudentLimits?: boolean } = {},
  ): Promise<CardView> {
    const current = await this.statusOf(userId, cardKey);

    if (!opts.bypassStudentLimits && !STUDENT_SETTABLE.includes(target)) {
      throw new AppError("FORBIDDEN", "This status cannot be set directly.");
    }
    if (current.status === "locked" || current.status === "coming_soon") {
      throw new AppError("CARD_LOCKED", "This card is not available yet.");
    }
    if (current.status === target) return current;
    if (!canTransition(current.status, target)) {
      throw new AppError("CONFLICT", `Cannot move card from ${current.status} to ${target}.`);
    }

    await this.deps.repos.cards.setProgress(userId, cardKey, target);
    await this.deps.audit.append({
      actorId: opts.actorId ?? userId,
      action: "cards.set_status",
      entityType: "card",
      entityId: `${userId}:${cardKey}`,
      meta: { from: current.status, to: target },
    });
    await this.syncSim(userId);
    return this.statusOf(userId, cardKey);
  }

  async requestNotify(userId: string, cardKey: string): Promise<{ created: boolean }> {
    const card = await this.statusOf(userId, cardKey);
    if (!card.comingSoon) throw new AppError("CONFLICT", "This card is already available.");
    const created = await this.deps.repos.cards.addNotifyRequest(userId, cardKey);
    return { created };
  }
}
