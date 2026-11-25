import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { CARD_STATUSES, canApproveRequest } from "@nivo/shared";
import { z } from "zod";
import { csvRow } from "../../lib/csv.js";
import { AppError, parseStrict } from "../../lib/errors.js";
import { isStepUpFresh } from "../../lib/step-up.js";
import { requireAuthContext, requireStaffMfa } from "../../plugins/auth.js";
import { createArgon2Hasher } from "../auth/service.js";
import { UniqueViolationError, type UserRecord } from "../../repositories/types.js";
import { ACCOMMODATION_NOTIFY_SETTING } from "../accommodation/service.js";
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
  action: z.enum(["students:mark_paid", "identity:reveal", "payments:refund", "exports:students", "exports:leads"]),
  targetUserId: z.string().uuid(),
  reason: z.string().trim().min(10).max(500),
});
const notifyEmailBody = z.object({
  email: z.string().email().max(200),
});

function assertStepUp(sessionId: string) {
  if (
    !isStepUpFresh(sessionId) &&
    process.env.NODE_ENV !== "test" &&
    process.env.ALLOW_STAFF_WITHOUT_MFA !== "true"
  ) {
    throw new AppError("STEP_UP_REQUIRED", "Re-confirm with your two-factor code.");
  }
}

function isSuperAdmin(role: string | null): boolean {
  return role === "super_admin";
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  const { repos, payments, cards, identity, audit } = app.services;

  app.addHook("preHandler", app.requireAuth);
  app.addHook("preHandler", async (req) => {
    requireStaffMfa(req);
  });

  app.get("/v1/admin/me", async (req) => {
    const ctx = requireAuthContext(req);
    return {
      id: ctx.user.id,
      role: ctx.user.role,
      permissions: ctx.permissions,
      totpEnabled: ctx.user.totpSecret !== null,
      stepUpFresh: isStepUpFresh(ctx.sessionId),
    };
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
        const pending = await createApproval({
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
      const ctx = requireAuthContext(req);
      const actor = ctx.user;
      assertStepUp(ctx.sessionId);

      if (!isSuperAdmin(actor.role)) {
        const pending = await createApproval({
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
    return { approvals: await listApprovals(filter) };
  });

  app.post(
    "/v1/admin/approvals",
    { preHandler: requirePermission("approvals:decide") },
    async (req, reply) => {
      // Allow creating from Approvals UI as well (requester must still have underlying perm via decide path).
      const body = parseStrict(createApprovalBody, req.body);
      const actor = requireAuthContext(req).user;
      const pending = await createApproval({
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
      const existing = await getApproval(id);
      if (!existing) throw new AppError("NOT_FOUND", "Approval not found.");
      if (existing.status !== "pending") throw new AppError("CONFLICT", "Approval already decided.");
      if (!canApproveRequest(existing.requesterId, ctx.user.id, ctx.permissions)) {
        throw new AppError("FORBIDDEN", "You cannot approve your own request.");
      }

      const updated = await decideApprovalRecord(id, decision, ctx.user.id, note);
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
        } else if (updated.action === "payments:refund") {
          await payments.refund(updated.targetUserId, ctx.user.id, updated.reason);
        }
      }

      return { approval: updated };
    },
  );

  app.post(
    "/v1/admin/students/:id/refund",
    { preHandler: requirePermission("payments:refund") },
    async (req, reply) => {
      const { id } = parseStrict(idParams, req.params);
      const { reason } = parseStrict(reasonBody, req.body);
      const ctx = requireAuthContext(req);
      assertStepUp(ctx.sessionId);
      if (ctx.user.id === id) throw new AppError("FORBIDDEN", "You cannot refund your own account.");

      if (!isSuperAdmin(ctx.user.role)) {
        const pending = await createApproval({
          action: "payments:refund",
          requesterId: ctx.user.id,
          requesterEmail: ctx.user.email,
          targetUserId: id,
          reason,
        });
        await audit.append({
          actorId: ctx.user.id,
          action: "approvals.requested",
          entityType: "approval",
          entityId: pending.id,
          meta: { action: pending.action, targetUserId: id },
        });
        return reply.code(202).send({ status: "pending_approval", approvalId: pending.id });
      }

      await payments.refund(id, ctx.user.id, reason);
      return reply.code(204).send();
    },
  );

  app.get("/v1/admin/audit", { preHandler: requirePermission("audit:read") }, async () => {
    const [entries, chain] = await Promise.all([audit.list(), audit.verify()]);
    return { chain, entries: entries.slice(-200).reverse() };
  });

  app.get("/v1/admin/settings", { preHandler: requirePermission("settings:links:edit") }, async () => {
    const [links, simRules, notifyEmail] = await Promise.all([
      repos.settings.get<Record<string, string>>(PARTNER_LINKS_SETTING),
      repos.settings.get<string[]>(SIM_RULES_SETTING),
      repos.settings.get<string>(ACCOMMODATION_NOTIFY_SETTING),
    ]);
    return {
      links: links ?? {},
      simRules: Array.isArray(simRules) ? simRules : DEFAULT_SIM_REQUIRED,
      accommodationNotifyEmail: typeof notifyEmail === "string" ? notifyEmail : "",
    };
  });

  app.put(
    "/v1/admin/settings/accommodation-notify",
    { preHandler: requirePermission("settings:links:edit") },
    async (req, reply) => {
      const { email } = parseStrict(notifyEmailBody, req.body);
      const actor = requireAuthContext(req).user;
      await repos.settings.set(ACCOMMODATION_NOTIFY_SETTING, email, actor.id);
      await repos.settings.set("roshan.email", email, actor.id);
      await audit.append({
        actorId: actor.id,
        action: "settings.accommodation_notify_updated",
        entityType: "setting",
        entityId: ACCOMMODATION_NOTIFY_SETTING,
      });
      return reply.code(204).send();
    },
  );

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

  app.get("/v1/admin/students/:id/timeline", { preHandler: requirePermission("audit:read") }, async (req) => {
    const { id } = parseStrict(idParams, req.params);
    const entries = await audit.list();
    const timeline = entries
      .filter((e) => e.entityId === id || (e.meta && (e.meta as { targetUserId?: string }).targetUserId === id))
      .slice(-100)
      .reverse();
    return { studentId: id, timeline };
  });

  app.get("/v1/admin/exports/students.csv", { preHandler: requirePermission("exports:students") }, async (req, reply) => {
    const ctx = requireAuthContext(req);
    assertStepUp(ctx.sessionId);
    const [users, profiles] = await Promise.all([repos.users.list(), repos.profiles.list()]);
    const byId = new Map(profiles.map((p) => [p.userId, p]));
    const rows = [
      csvRow(["id", "fullName", "email", "country", "intake", "emailVerified", "paymentStatus", "identityComplete"]),
      ...users
        .filter((u) => byId.has(u.id) && !u.role)
        .map((u) => {
          const p = byId.get(u.id)!;
          return csvRow([
            u.id,
            u.fullName,
            u.email,
            u.country,
            u.intake,
            u.emailVerifiedAt ? "true" : "false",
            p.paymentStatus,
            p.identityComplete ? "true" : "false",
          ]);
        }),
    ];
    await audit.append({
      actorId: ctx.user.id,
      action: "exports.students",
      entityType: "export",
      entityId: "students.csv",
      meta: { rows: rows.length - 1 },
    });
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", 'attachment; filename="students.csv"');
    return reply.send(rows.join("\n"));
  });

  app.get("/v1/admin/exports/leads.csv", { preHandler: requirePermission("exports:leads") }, async (req, reply) => {
    const ctx = requireAuthContext(req);
    assertStepUp(ctx.sessionId);
    const leads = await repos.leads.list();
    const rows = [
      csvRow(["id", "userId", "city", "budget", "roomType", "status", "phone", "createdAt"]),
      ...leads.map((l) =>
        csvRow([l.id, l.userId, l.city, l.budget, l.roomType, l.status, l.phone, l.createdAt.toISOString()]),
      ),
    ];
    await audit.append({
      actorId: ctx.user.id,
      action: "exports.leads",
      entityType: "export",
      entityId: "leads.csv",
      meta: { rows: rows.length - 1 },
    });
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", 'attachment; filename="leads.csv"');
    return reply.send(rows.join("\n"));
  });

  const createAdminBody = z.object({
    email: z.string().email().max(254),
    fullName: z.string().trim().min(2).max(80),
    password: z.string().min(10).max(128),
  });

  app.get("/v1/admin/admins", { preHandler: requirePermission("admins:manage") }, async () => {
    const users = await repos.users.list();
    return {
      admins: users
        .filter((u) => u.role === "super_admin" && !u.deletedAt)
        .map((u) => ({
          id: u.id,
          email: u.email,
          fullName: u.fullName,
          totpEnabled: u.totpSecret !== null,
          createdAt: u.createdAt,
        })),
    };
  });

  app.post("/v1/admin/admins", { preHandler: requirePermission("admins:manage") }, async (req, reply) => {
    const body = parseStrict(createAdminBody, req.body);
    const ctx = requireAuthContext(req);
    assertStepUp(ctx.sessionId);

    const email = body.email.trim().toLowerCase();
    if (await repos.users.findByEmail(email)) {
      throw new AppError("CONFLICT", "An account with that email already exists.");
    }

    const hasher = createArgon2Hasher({
      memoryCost: app.config.ARGON2_MEMORY_KIB,
      timeCost: app.config.ARGON2_TIME_COST,
    });
    const now = new Date();
    const user: UserRecord = {
      id: randomUUID(),
      email,
      fullName: body.fullName,
      phone: "+49000000000",
      country: "DE",
      intake: "ops",
      passwordHash: await hasher.hash(body.password),
      emailVerifiedAt: now,
      role: "super_admin",
      googleSub: null,
      avatarUrl: null,
      passwordSet: true,
      totpSecret: null,
      failedLoginCount: 0,
      lockedUntil: null,
      createdAt: now,
      deletedAt: null,
    };
    try {
      await repos.users.create(user);
    } catch (err) {
      if (err instanceof UniqueViolationError) {
        throw new AppError("CONFLICT", "An account with that email already exists.");
      }
      throw err;
    }
    await audit.append({
      actorId: ctx.user.id,
      action: "admins.created",
      entityType: "user",
      entityId: user.id,
      meta: { email },
    });
    return reply.code(201).send({ id: user.id, email: user.email, fullName: user.fullName });
  });

  const createConsultancyBody = z.object({
    name: z.string().trim().min(2).max(160),
    code: z
      .string()
      .trim()
      .min(4)
      .max(32)
      .regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, underscore or hyphen only."),
    managerEmail: z.string().email().max(254).optional(),
    managerPassword: z.string().min(10).max(128).optional(),
    managerName: z.string().trim().min(2).max(80).optional(),
  });

  app.get("/v1/admin/consultancies", { preHandler: requirePermission("consultancies:manage") }, async () => {
    const list = await repos.consultancies.list();
    return {
      consultancies: list.map((c) => ({
        id: c.id,
        name: c.name,
        code: c.referralCode,
        link: `/r/${c.referralCode}`,
      })),
    };
  });

  app.post(
    "/v1/admin/consultancies",
    { preHandler: requirePermission("consultancies:manage") },
    async (req, reply) => {
      const body = parseStrict(createConsultancyBody, req.body);
      const ctx = requireAuthContext(req);
      assertStepUp(ctx.sessionId);

      const referralCode = body.code.toUpperCase();
      if (await repos.consultancies.findByReferralCode(referralCode)) {
        throw new AppError("CONFLICT", "That referral code is already in use.");
      }

      const created = await app.services.consultancy.create(body.name, referralCode);
      let manager: { id: string; email: string } | undefined;

      if (body.managerEmail) {
        if (!body.managerPassword) {
          throw new AppError("VALIDATION_FAILED", "Manager password is required when creating a login.");
        }
        const email = body.managerEmail.trim().toLowerCase();
        if (await repos.users.findByEmail(email)) {
          throw new AppError("CONFLICT", "A user with that manager email already exists.");
        }
        const hasher = createArgon2Hasher({
          memoryCost: app.config.ARGON2_MEMORY_KIB,
          timeCost: app.config.ARGON2_TIME_COST,
        });
        const now = new Date();
        const user: UserRecord = {
          id: randomUUID(),
          email,
          fullName: body.managerName?.trim() || `${body.name} Manager`,
          phone: "+49000000000",
          country: "DE",
          intake: "consultancy",
          passwordHash: await hasher.hash(body.managerPassword),
          emailVerifiedAt: now,
          role: "consultancy",
          googleSub: null,
          avatarUrl: null,
          passwordSet: true,
          totpSecret: null,
          failedLoginCount: 0,
          lockedUntil: null,
          createdAt: now,
          deletedAt: null,
        };
        await repos.users.create(user);
        await repos.consultancies.addMember(user.id, created.id, "owner");
        manager = { id: user.id, email: user.email };
      }

      await audit.append({
        actorId: ctx.user.id,
        action: "consultancies.created",
        entityType: "consultancy",
        entityId: created.id,
        meta: { code: created.code, managerId: manager?.id },
      });

      return reply.code(201).send({ ...created, manager });
    },
  );
}
