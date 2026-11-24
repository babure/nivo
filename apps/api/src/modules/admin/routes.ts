import type { FastifyInstance } from "fastify";
import { CARD_STATUSES, canApproveRequest } from "@nivo/shared";
import { z } from "zod";
import { AppError, parseStrict } from "../../lib/errors.js";
import { requireAuthContext } from "../../plugins/auth.js";
import { PARTNER_LINKS_SETTING, partnerLinksSchema } from "../partners/routes.js";
import { DEFAULT_SIM_REQUIRED, SIM_RULES_SETTING } from "../cards/service.js";
import {
  createApproval,
  decideApprovalRecord,
  getApproval,
  listApprovals,
  type ApprovalAction,
} from "./approvals-store.js";
import { requirePermission } from "./permissions.js";

const idParams = z.object({ id: z.string().uuid() });
const cardParams = z.object({ id: z.string().uuid(), key: z.string().regex(/^[a-z0-9_]{1,64}$/) });
const reasonBody = z.object({ reason: z.string().trim().min(10).max(500) });
const cardStatusBody = z.object({
  status: z.enum(CARD_STATUSES),
  reason: z.string().trim().min(10).max(500),
});
const simRulesBody = z.object({
  requiredCardKeys: z.array(z.string().regex(/^[a-z0-9_]{1,64}$/)).max(20),
});
const decideBody = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(500).optional(),
});
const createApprovalBody = z.object({
  action: z.enum(["students:mark_paid", "identity:reveal"]),
  targetUserId: z.string().uuid(),
  reason: z.string().trim().min(10).max(500),
});

function isSuperAdmin(role: string | null): boolean {
  return role === "super_admin";
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  const { repos, payments, cards, identity, audit } = app.services;

  app.addHook("preHandler", app.requireAuth);

  app.get("/v1/admin/me", async (req) => {
    const ctx = requireAuthContext(req);
    return { id: ctx.user.id, role: ctx.user.role, permissions: ctx.permissions };
  });

  app.get("/v1/admin/students", { preHandler: requirePermission("students:read") }, async () => {
    const [users, profiles] = await Promise.all([repos.users.list(), repos.profiles.list()]);
    const byId = new Map(profiles.map((p) => [p.userId, p]));
    return {
      students: users
        .filter((u) => byId.has(u.id))
        .map((u) => {
          const p = byId.get(u.id)!;
          return {
            id: u.id,
            fullName: u.fullName,
            email: u.email,
            country: u.country,
            intake: u.intake,
            emailVerified: u.emailVerifiedAt !== null,
            paymentStatus: p.paymentStatus,
            identityComplete: p.identityComplete,
            createdAt: u.createdAt,
          };
        }),
    };
  });

  app.post(
    "/v1/admin/students/:id/mark-paid",
    { preHandler: requirePermission("students:mark_paid") },
    async (req, reply) => {
      const { id } = parseStrict(idParams, req.params);
      const { reason } = parseStrict(reasonBody, req.body);
      const actor = requireAuthContext(req).user;
      if (actor.id === id) throw new AppError("FORBIDDEN", "You cannot mark your own account as paid.");

      if (!isSuperAdmin(actor.role)) {
        const pending = createApproval({
          action: "students:mark_paid",
          requesterId: actor.id,
          requesterEmail: actor.email,
          targetUserId: id,
          reason,
        });
        await audit.append({
          actorId: actor.id,
          action: "approvals.requested",
          entityType: "approval",
          entityId: pending.id,
          meta: { action: pending.action, targetUserId: id },
        });
        return reply.code(202).send({ status: "pending_approval", approvalId: pending.id });
      }

      await payments.markPaidManually(id, actor.id, reason);
      return reply.code(204).send();
    },
  );

  app.post(
    "/v1/admin/students/:id/cards/:key/status",
    { preHandler: requirePermission("students:set_card_status") },
    async (req) => {
      const { id, key } = parseStrict(cardParams, req.params);
      const { status, reason } = parseStrict(cardStatusBody, req.body);
      const actor = requireAuthContext(req).user;
      const view = await cards.setStatus(id, key, status, {
        actorId: actor.id,
        bypassStudentLimits: true,
      });
      await audit.append({
        actorId: actor.id,
        action: "admin.card_status_override",
        entityType: "card",
        entityId: `${id}:${key}`,
        meta: { status, reason },
      });
      return view;
    },
  );

  app.post(
    "/v1/admin/students/:id/identity/reveal",
    { preHandler: requirePermission("identity:reveal") },
    async (req, reply) => {
      const { id } = parseStrict(idParams, req.params);
      const { reason } = parseStrict(reasonBody, req.body);
      const actor = requireAuthContext(req).user;

      if (!isSuperAdmin(actor.role)) {
        const pending = createApproval({
          action: "identity:reveal",
          requesterId: actor.id,
          requesterEmail: actor.email,
          targetUserId: id,
          reason,
        });
        await audit.append({
          actorId: actor.id,
          action: "approvals.requested",
          entityType: "approval",
          entityId: pending.id,
          meta: { action: pending.action, targetUserId: id },
        });
        return reply.code(202).send({ status: "pending_approval", approvalId: pending.id });
      }

      return identity.reveal(id, actor.id, reason);
    },
  );

  app.get("/v1/admin/approvals", { preHandler: requirePermission("approvals:decide") }, async (req) => {
    const status = (req.query as { status?: string }).status;
    const filter =
      status === "pending" || status === "approved" || status === "rejected"
        ? { status: status as "pending" | "approved" | "rejected" }
        : undefined;
    return { approvals: listApprovals(filter) };
  });

  app.post(
    "/v1/admin/approvals",
    { preHandler: requirePermission("approvals:decide") },
    async (req, reply) => {
      // Allow creating from Approvals UI as well (requester must still have underlying perm via decide path).
      const body = parseStrict(createApprovalBody, req.body);
      const actor = requireAuthContext(req).user;
      const pending = createApproval({
        action: body.action as ApprovalAction,
        requesterId: actor.id,
        requesterEmail: actor.email,
        targetUserId: body.targetUserId,
        reason: body.reason,
      });
      await audit.append({
        actorId: actor.id,
        action: "approvals.requested",
        entityType: "approval",
        entityId: pending.id,
        meta: { action: pending.action, targetUserId: body.targetUserId },
      });
      return reply.code(201).send(pending);
    },
  );

  app.post(
    "/v1/admin/approvals/:id/decide",
    { preHandler: requirePermission("approvals:decide") },
    async (req) => {
      const { id } = parseStrict(idParams, req.params);
      const { decision, note } = parseStrict(decideBody, req.body);
      const ctx = requireAuthContext(req);
      const existing = getApproval(id);
      if (!existing) throw new AppError("NOT_FOUND", "Approval not found.");
      if (existing.status !== "pending") throw new AppError("CONFLICT", "Approval already decided.");
      if (!canApproveRequest(existing.requesterId, ctx.user.id, ctx.permissions)) {
        throw new AppError("FORBIDDEN", "You cannot approve your own request.");
      }

      const updated = decideApprovalRecord(id, decision, ctx.user.id, note);
      if (!updated) throw new AppError("CONFLICT", "Approval already decided.");

      await audit.append({
        actorId: ctx.user.id,
        action: decision === "approved" ? "approvals.approved" : "approvals.rejected",
        entityType: "approval",
        entityId: id,
        meta: { action: updated.action, note: note ?? null },
      });

      if (decision === "approved") {
        if (updated.action === "students:mark_paid") {
          await payments.markPaidManually(updated.targetUserId, ctx.user.id, updated.reason);
        } else if (updated.action === "identity:reveal") {
          const revealed = await identity.reveal(updated.targetUserId, ctx.user.id, updated.reason);
          return { approval: updated, result: revealed };
        }
      }

      return { approval: updated };
    },
  );

  app.get("/v1/admin/audit", { preHandler: requirePermission("audit:read") }, async () => {
    const [entries, chain] = await Promise.all([audit.list(), audit.verify()]);
    return { chain, entries: entries.slice(-200).reverse() };
  });

  app.get("/v1/admin/settings", { preHandler: requirePermission("settings:links:edit") }, async () => {
    const [links, simRules] = await Promise.all([
      repos.settings.get<Record<string, string>>(PARTNER_LINKS_SETTING),
      repos.settings.get<string[]>(SIM_RULES_SETTING),
    ]);
    return {
      links: links ?? {},
      simRules: Array.isArray(simRules) ? simRules : DEFAULT_SIM_REQUIRED,
    };
  });

  app.put(
    "/v1/admin/settings/links",
    { preHandler: requirePermission("settings:links:edit") },
    async (req, reply) => {
      const links = parseStrict(z.object({ links: partnerLinksSchema }), req.body).links;
      const actor = requireAuthContext(req).user;
      await repos.settings.set(PARTNER_LINKS_SETTING, links, actor.id);
      await audit.append({
        actorId: actor.id,
        action: "settings.links_updated",
        entityType: "setting",
        entityId: PARTNER_LINKS_SETTING,
        meta: { keys: Object.keys(links) },
      });
      return reply.code(204).send();
    },
  );

  app.put(
    "/v1/admin/settings/sim-rules",
    { preHandler: requirePermission("settings:sim_rules:edit") },
    async (req, reply) => {
      const { requiredCardKeys } = parseStrict(simRulesBody, req.body);
      const actor = requireAuthContext(req).user;
      await repos.settings.set(SIM_RULES_SETTING, requiredCardKeys, actor.id);
      await audit.append({
        actorId: actor.id,
        action: "settings.sim_rules_updated",
        entityType: "setting",
        entityId: SIM_RULES_SETTING,
        meta: { requiredCardKeys },
      });
      return reply.code(204).send();
    },
  );
}
