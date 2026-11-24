import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError, parseStrict } from "../../lib/errors.js";
import { hashIp } from "../../lib/tokens.js";
import { requireAuthContext } from "../../plugins/auth.js";

const slugParams = z.object({ slug: z.enum(["terms", "privacy", "refund", "cookies"]) });
const acceptBody = z.object({
  slug: z.enum(["terms", "privacy", "refund", "cookies"]),
  version: z.string().min(1).max(40),
});

export async function legalRoutes(app: FastifyInstance): Promise<void> {
  const { repos } = app.services;

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
    await repos.consents.add({
      id: randomUUID(),
      userId: user.id,
      kind: slug,
      version,
      ipHash: hashIp(req.ip),
      acceptedAt: new Date(),
    });
    return reply.code(201).send({ status: "accepted", slug, version });
  });
}
