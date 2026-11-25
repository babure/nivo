import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  CARD_STATUSES,
  addManagerSchema,
  createAdminSchema,
  createConsultancySchema,
  pickUniqueReferralCode,
  suggestConsultancyCodeSchema,
} from "@nivo/shared";
import { z } from "zod";
import { csvRow } from "../../lib/csv.js";
import { AppError, parseStrict, parseWith } from "../../lib/errors.js";
import { isStepUpFresh } from "../../lib/step-up.js";
import { requireAuthContext, requireStaffMfa } from "../../plugins/auth.js";
import { createArgon2Hasher } from "../auth/service.js";
import { UniqueViolationError, type UserRecord } from "../../repositories/types.js";
import { ACCOMMODATION_NOTIFY_SETTING } from "../accommodation/service.js";
import { PARTNER_LINKS_SETTING, partnerLinksSchema } from "../partners/routes.js";
import { DEFAULT_SIM_REQUIRED, SIM_RULES_SETTING } from "../cards/service.js";
import { DEFAULT_UI_COPY, UI_COPY_SETTING, mergeUiCopy } from "../copy/defaults.js";
import { listProofs } from "../proofs/store.js";
import { requirePermission } from "./permissions.js";

const idParams = z.object({
  id: z.string().uuid("Invalid id"),
});
const cardParams = z.object({
  id: z.string().uuid("Invalid id"),
  key: z.string().regex(/^[a-z0-9_]{1,64}$/, "Invalid card key"),
});
const reasonBody = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Give a reason of at least 10 characters")
    .max(500, "Reason is too long (max 500 characters)"),
});
const cardStatusBody = z.object({
  status: z.enum(CARD_STATUSES, {
    errorMap: () => ({ message: "Choose a valid card status" }),
  }),
  reason: z
    .string()
    .trim()
    .min(10, "Give a reason of at least 10 characters")
    .max(500, "Reason is too long (max 500 characters)"),
});
const simRulesBody = z.object({
  requiredCardKeys: z
    .array(z.string().regex(/^[a-z0-9_]{1,64}$/, "Invalid card key"))
    .max(20, "Too many required cards (max 20)"),
});
const notifyEmailBody = z.object({
  email: z.string().email().max(200),
});
const cardDefBody = z.object({
  key: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,63}$/, "Use a lowercase slug (letters, numbers, underscores)")
    .optional(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).default(""),
  position: z.number().int().min(0).max(999).optional(),
  comingSoon: z.boolean().optional(),
  published: z.boolean().optional(),
});
const textsBody = z.object({
  texts: z.record(z.string().max(2000)).refine((o) => Object.keys(o).length <= 80, "Too many text keys"),
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

  app.get("/v1/admin/reports/funnel", { preHandler: requirePermission("reports:read") }, async () => {
    const [users, profiles, defs, leads, pendingProofList] = await Promise.all([
      repos.users.list(),
      repos.profiles.list(),
      repos.cards.listDefinitions(),
      repos.leads.list(),
      listProofs({ status: "pending" }),
    ]);
    const studentIds = users.filter((u) => !u.role && !u.deletedAt).map((u) => u.id);
    const profileByUser = new Map(profiles.map((p) => [p.userId, p]));
    const students = studentIds.filter((id) => profileByUser.has(id));
    let paid = 0;
    const completions: Record<string, number> = {};
    for (const def of defs) completions[def.key] = 0;
    let simUnlocked = 0;

    await Promise.all(
      students.map(async (id) => {
        const p = profileByUser.get(id);
        if (p?.paymentStatus === "paid") paid += 1;
        const progress = await repos.cards.listProgress(id);
        for (const row of progress) {
          if (row.status === "completed" && completions[row.cardKey] !== undefined) {
            completions[row.cardKey] += 1;
          }
          if (row.cardKey === "sim" && row.status !== "locked") simUnlocked += 1;
        }
      }),
    );

    return {
      registrations: students.length,
      paid,
      unpaid: Math.max(0, students.length - paid),
      completions,
      simUnlocked,
      accommodationLeads: leads.length,
      pendingProofs: pendingProofList.length,
      generatedAt: new Date().toISOString(),
    };
  });

  app.get("/v1/admin/cards", { preHandler: requirePermission("cards:edit") }, async () => {
    const cards = await repos.cards.listDefinitions();
    return { cards: cards.sort((a, b) => a.position - b.position) };
  });

  app.post("/v1/admin/cards", { preHandler: requirePermission("cards:create") }, async (req, reply) => {
    const body = parseStrict(
      z.object({
        key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/, "Use a lowercase slug (letters, numbers, underscores)"),
        title: z.string().trim().min(1).max(160),
        description: z.string().trim().max(2000).default(""),
        position: z.number().int().min(0).max(999).optional(),
        comingSoon: z.boolean().optional(),
        published: z.boolean().optional(),
      }),
      req.body,
    );
    const existing = await repos.cards.listDefinitions();
    if (existing.some((c) => c.key === body.key)) {
      throw new AppError("CONFLICT", "A card with that key already exists.");
    }
    const actor = requireAuthContext(req).user;
    const position = body.position ?? (existing.reduce((m, c) => Math.max(m, c.position), 0) + 1);
    const def = await repos.cards.upsertDefinition({
      key: body.key,
      title: body.title,
      description: body.description,
      position,
      comingSoon: body.comingSoon ?? true,
      published: body.published ?? true,
    });
    await audit.append({
      actorId: actor.id,
      action: "cards.created",
      entityType: "card",
      entityId: def.key,
      meta: { title: def.title },
    });
    return reply.code(201).send({ card: def });
  });

  app.put("/v1/admin/cards/:key", { preHandler: requirePermission("cards:edit") }, async (req, reply) => {
    const key = parseStrict(z.object({ key: z.string().regex(/^[a-z0-9_]{1,64}$/) }), req.params).key;
    const body = parseStrict(cardDefBody, req.body);
    const existing = await repos.cards.listDefinitions();
    const current = existing.find((c) => c.key === key);
    if (!current) throw new AppError("NOT_FOUND", "Unknown card.");
    const actor = requireAuthContext(req).user;
    const def = await repos.cards.upsertDefinition({
      key,
      title: body.title,
      description: body.description,
      position: body.position ?? current.position,
      comingSoon: body.comingSoon ?? current.comingSoon,
      published: body.published ?? current.published,
    });
    await audit.append({
      actorId: actor.id,
      action: "cards.updated",
      entityType: "card",
      entityId: key,
      meta: { comingSoon: def.comingSoon, published: def.published },
    });
    return reply.send({ card: def });
  });

  app.get("/v1/admin/students", { preHandler: requirePermission("students:read") }, async () => {
    const [users, profiles] = await Promise.all([repos.users.list(), repos.profiles.list()]);
    const byId = new Map(profiles.map((p) => [p.userId, p]));
    const withProfiles = users.filter((u) => byId.has(u.id));
    const students = await Promise.all(
      withProfiles.map(async (u) => {
        const p = byId.get(u.id)!;
        const cardViews = await cards.list(u.id);
        const cardStatus = Object.fromEntries(cardViews.map((c) => [c.key, c.status]));
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
          cards: cardStatus,
        };
      }),
    );
    return { students };
  });

  app.post(
    "/v1/admin/students/:id/mark-paid",
    { preHandler: requirePermission("students:mark_paid") },
    async (req, reply) => {
      const { id } = parseStrict(idParams, req.params);
      const { reason } = parseStrict(reasonBody, req.body);
      const actor = requireAuthContext(req).user;
      if (actor.id === id) throw new AppError("FORBIDDEN", "You cannot mark your own account as paid.");

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
    async (req) => {
      const { id } = parseStrict(idParams, req.params);
      const { reason } = parseStrict(reasonBody, req.body);
      const ctx = requireAuthContext(req);
      assertStepUp(ctx.sessionId);
      return identity.reveal(id, ctx.user.id, reason);
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

      await payments.refund(id, ctx.user.id, reason);
      return reply.code(204).send();
    },
  );

  app.get("/v1/admin/audit", { preHandler: requirePermission("audit:read") }, async () => {
    const [entries, chain] = await Promise.all([audit.list(), audit.verify()]);
    return { chain, entries: entries.slice(-200).reverse() };
  });

  app.get("/v1/admin/settings", { preHandler: requirePermission("settings:links:edit") }, async () => {
    const [links, simRules, notifyEmail, texts] = await Promise.all([
      repos.settings.get<Record<string, string>>(PARTNER_LINKS_SETTING),
      repos.settings.get<string[]>(SIM_RULES_SETTING),
      repos.settings.get<string>(ACCOMMODATION_NOTIFY_SETTING),
      repos.settings.get<Record<string, string>>(UI_COPY_SETTING),
    ]);
    return {
      links: links ?? {},
      simRules: Array.isArray(simRules) ? simRules : DEFAULT_SIM_REQUIRED,
      accommodationNotifyEmail: typeof notifyEmail === "string" ? notifyEmail : "",
      texts: mergeUiCopy(texts),
      textDefaults: DEFAULT_UI_COPY,
    };
  });

  app.put(
    "/v1/admin/settings/texts",
    { preHandler: requirePermission("settings:texts:edit") },
    async (req, reply) => {
      const { texts } = parseStrict(textsBody, req.body);
      const actor = requireAuthContext(req).user;
      const cleaned = Object.fromEntries(
        Object.entries(texts)
          .map(([k, v]) => [k.trim(), typeof v === "string" ? v.trim() : ""])
          .filter(([k, v]) => k.length > 0 && v.length > 0),
      );
      await repos.settings.set(UI_COPY_SETTING, cleaned, actor.id);
      await audit.append({
        actorId: actor.id,
        action: "settings.texts_updated",
        entityType: "setting",
        entityId: UI_COPY_SETTING,
        meta: { keys: Object.keys(cleaned) },
      });
      return reply.code(204).send();
    },
  );

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
    const body = parseStrict(createAdminSchema, req.body);
    const ctx = requireAuthContext(req);
    assertStepUp(ctx.sessionId);

    const email = body.email;
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


  async function inviteConsultancyManager(opts: {
    consultancyId: string;
    orgName: string;
    email: string;
    fullName?: string;
  }): Promise<{ id: string; email: string; inviteSent: boolean }> {
    if (await repos.consultancies.hasMembers(opts.consultancyId)) {
      throw new AppError("CONFLICT", "This consultancy already has a manager login.");
    }
    const email = opts.email.trim().toLowerCase();
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
      fullName: opts.fullName?.trim() || `${opts.orgName} Manager`,
      phone: "+49000000000",
      country: "DE",
      intake: "consultancy",
      // Placeholder hash until they set a password via the invite email.
      passwordHash: await hasher.hash(randomUUID()),
      emailVerifiedAt: null,
      role: "consultancy",
      googleSub: null,
      avatarUrl: null,
      passwordSet: false,
      totpSecret: null,
      failedLoginCount: 0,
      lockedUntil: null,
      createdAt: now,
      deletedAt: null,
    };
    await repos.users.create(user);
    await repos.consultancies.addMember(user.id, opts.consultancyId, "owner");
    await app.services.auth.sendConsultancyInvite(user.id, opts.orgName);
    return { id: user.id, email: user.email, inviteSent: true };
  }

  app.get("/v1/admin/consultancies", { preHandler: requirePermission("consultancies:manage") }, async () => {
    const list = await repos.consultancies.list();
    const consultancies = await Promise.all(
      list.map(async (c) => ({
        id: c.id,
        name: c.name,
        code: c.referralCode,
        link: `/r/${c.referralCode}`,
        hasManager: await repos.consultancies.hasMembers(c.id),
      })),
    );
    return { consultancies };
  });

  /** Suggest a unique referral code before create — regenerate by sending prior codes in `avoid`. */
  app.post(
    "/v1/admin/consultancies/suggest-code",
    { preHandler: requirePermission("consultancies:manage") },
    async (req) => {
      const body = parseStrict(suggestConsultancyCodeSchema, req.body);
      try {
        const code = await pickUniqueReferralCode({
          name: body.name,
          avoid: body.avoid,
          isTaken: async (candidate) => Boolean(await repos.consultancies.findByReferralCode(candidate)),
        });
        return { code };
      } catch {
        throw new AppError(
          "CONFLICT",
          "Could not generate a unique referral code. Try a different organisation name.",
        );
      }
    },
  );

  app.post(
    "/v1/admin/consultancies",
    { preHandler: requirePermission("consultancies:manage") },
    async (req, reply) => {
      const body = parseWith(createConsultancySchema, req.body);
      const ctx = requireAuthContext(req);
      assertStepUp(ctx.sessionId);

      const referralCode = body.code.toUpperCase();
      if (await repos.consultancies.findByReferralCode(referralCode)) {
        throw new AppError("CONFLICT", "That referral code is already in use.");
      }

      const created = await app.services.consultancy.create(body.name, referralCode);
      let manager: { id: string; email: string; inviteSent: boolean } | undefined;

      if (body.managerEmail) {
        manager = await inviteConsultancyManager({
          consultancyId: created.id,
          orgName: body.name,
          email: body.managerEmail,
          fullName: body.managerName,
        });
      }

      await audit.append({
        actorId: ctx.user.id,
        action: "consultancies.created",
        entityType: "consultancy",
        entityId: created.id,
        meta: { code: created.code, managerId: manager?.id },
      });

      return reply.code(201).send({ ...created, manager, hasManager: Boolean(manager) });
    },
  );

  app.post(
    "/v1/admin/consultancies/:id/managers",
    { preHandler: requirePermission("consultancies:manage") },
    async (req, reply) => {
      const { id } = parseStrict(idParams, req.params);
      const body = parseStrict(addManagerSchema, req.body);
      const ctx = requireAuthContext(req);
      assertStepUp(ctx.sessionId);

      const org = await repos.consultancies.findById(id);
      if (!org) throw new AppError("NOT_FOUND", "Consultancy not found.");

      const manager = await inviteConsultancyManager({
        consultancyId: org.id,
        orgName: org.name,
        email: body.email,
        fullName: body.fullName,
      });

      await audit.append({
        actorId: ctx.user.id,
        action: "consultancies.manager_added",
        entityType: "consultancy",
        entityId: org.id,
        meta: { managerId: manager.id },
      });

      return reply.code(201).send({ manager });
    },
  );
}
