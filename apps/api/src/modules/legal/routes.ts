import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createDocument, findTermsDocument, listDocumentsForUser } from "../../lib/documents-store.js";
import { AppError, parseStrict } from "../../lib/errors.js";
import { writeTermsAcceptancePdf } from "../../lib/terms-pdf.js";
import { hashIp } from "../../lib/tokens.js";
import { requireAuthContext } from "../../plugins/auth.js";
import { requirePermission } from "../admin/permissions.js";

export const LEGAL_SLUGS = ["terms", "privacy", "refund", "cookies", "impressum", "our_role"] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

const slugParams = z.object({ slug: z.enum(LEGAL_SLUGS) });
const acceptBody = z.object({
  slug: z.enum(LEGAL_SLUGS),
  version: z.string().min(1).max(40),
});
const publishBody = z.object({
  slug: z.enum(LEGAL_SLUGS),
  version: z.string().min(1).max(40),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(100_000),
});

/** True when the user has no terms consent or it does not match the published version. */
export async function userNeedsTermsReaccept(
  repos: {
    consents: { listForUser(userId: string): Promise<{ kind: string; version: string; acceptedAt: Date }[]> };
    legal: { getPublished(slug: string): Promise<{ version: string } | null> };
  },
  userId: string,
): Promise<boolean> {
  const published = await repos.legal.getPublished("terms");
  if (!published) return false;
  const consents = await repos.consents.listForUser(userId);
  const latest = consents
    .filter((c) => c.kind === "terms")
    .sort((a, b) => b.acceptedAt.getTime() - a.acceptedAt.getTime())[0];
  return !latest || latest.version !== published.version;
}

async function ensureTermsPdf(opts: {
  userId: string;
  fullName: string;
  email: string;
  version: string;
  title: string;
  acceptedAt: Date;
}): Promise<void> {
  const existing = await findTermsDocument(opts.userId, opts.version);
  if (existing) return;
  try {
    const storageKey = await writeTermsAcceptancePdf({
      fullName: opts.fullName,
      email: opts.email,
      version: opts.version,
      title: opts.title,
      acceptedAt: opts.acceptedAt,
    });
    await createDocument({
      userId: opts.userId,
      kind: "terms_pdf",
      title: `Terms ${opts.version}`,
      storageKey,
    });
  } catch {
    /* best-effort PDF — acceptance still recorded */
  }
}

export async function legalRoutes(app: FastifyInstance): Promise<void> {
  const { repos, audit } = app.services;

  app.get("/v1/legal", async () => {
    const docs = await repos.legal.list();
    return { documents: docs.map(({ slug, version, title, publishedAt }) => ({ slug, version, title, publishedAt })) };
  });

  app.get("/v1/legal/:slug", async (req) => {
    const { slug } = parseStrict(slugParams, req.params);
    const doc = await repos.legal.getPublished(slug);
    if (!doc) throw new AppError("NOT_FOUND", "Document not found.");
    return doc;
  });

  /** Re-acceptance when a new version is published. */
  app.post("/v1/legal/accept", { preHandler: app.requireAuth }, async (req, reply) => {
    const { slug, version } = parseStrict(acceptBody, req.body);
    const doc = await repos.legal.getPublished(slug);
    if (!doc) throw new AppError("NOT_FOUND", "Document not found.");
    if (doc.version !== version) {
      throw new AppError("TERMS_REACCEPT_REQUIRED", `Current ${slug} version is ${doc.version}.`);
    }
    const { user } = requireAuthContext(req);
    const acceptedAt = new Date();
    await repos.consents.add({
      id: randomUUID(),
      userId: user.id,
      kind: slug,
      version,
      ipHash: hashIp(req.ip),
      acceptedAt,
    });
    if (slug === "terms") {
      await ensureTermsPdf({
        userId: user.id,
        fullName: user.fullName,
        email: user.email,
        version,
        title: doc.title,
        acceptedAt,
      });
    }
    return reply.code(201).send({ status: "accepted", slug, version });
  });

  /** Admin publish new version (REQ-LEG-06). Prior versions remain listed when unique (slug, version). */
  app.put(
    "/v1/admin/legal/publish",
    { preHandler: [app.requireAuth, requirePermission("legal:publish")] },
    async (req, reply) => {
      const body = parseStrict(publishBody, req.body);
      const actor = requireAuthContext(req).user;
      const doc = await repos.legal.publish({
        ...body,
        published: true,
        publishedAt: new Date(),
      });
      await audit.append({
        actorId: actor.id,
        action: "legal.published",
        entityType: "legal",
        entityId: `${body.slug}:${body.version}`,
      });
      return reply.code(200).send(doc);
    },
  );
}

/** Lazy-ensure Terms PDF when listing documents (idempotent). */
export async function ensureTermsPdfForUser(opts: {
  repos: {
    consents: { listForUser(userId: string): Promise<{ kind: string; version: string; acceptedAt: Date }[]> };
    legal: { getPublished(slug: string): Promise<{ version: string; title: string } | null> };
    users: { findById(id: string): Promise<{ fullName: string; email: string } | null> };
  };
  userId: string;
}): Promise<void> {
  const consents = await opts.repos.consents.listForUser(opts.userId);
  const latest = consents
    .filter((c) => c.kind === "terms")
    .sort((a, b) => b.acceptedAt.getTime() - a.acceptedAt.getTime())[0];
  if (!latest) return;
  const docs = await listDocumentsForUser(opts.userId);
  if (docs.some((d) => d.kind === "terms_pdf" && d.title === `Terms ${latest.version}`)) return;
  const published = await opts.repos.legal.getPublished("terms");
  const user = await opts.repos.users.findById(opts.userId);
  if (!user) return;
  await ensureTermsPdf({
    userId: opts.userId,
    fullName: user.fullName,
    email: user.email,
    version: latest.version,
    title: published?.title ?? "Terms of Service",
    acceptedAt: latest.acceptedAt,
  });
}
