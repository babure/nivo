import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDocument, listDocumentsForUser } from "../../lib/documents-store.js";
import { AppError, parseStrict } from "../../lib/errors.js";
import { readBinaryBlob } from "../../lib/storage.js";
import { requireAuthContext } from "../../plugins/auth.js";
import { ensureTermsPdfForUser } from "../legal/routes.js";

const idParams = z.object({ id: z.string().uuid() });

function contentTypeFor(doc: { kind: string; title: string }): string {
  if (doc.kind === "invoice_pdf" || doc.kind === "terms_pdf" || doc.title.toLowerCase().endsWith(".pdf")) {
    return "application/pdf";
  }
  return "application/octet-stream";
}

function filenameFor(doc: { kind: string; title: string }): string {
  if (doc.kind === "invoice_pdf" || doc.kind === "terms_pdf") return `${doc.title}.pdf`;
  return doc.title.includes(".") ? doc.title : `${doc.title}.bin`;
}

async function loadOwnedDocument(req: { params: unknown }, userId: string) {
  const { id } = parseStrict(idParams, req.params);
  const doc = await getDocument(id);
  if (!doc || doc.userId !== userId) throw new AppError("NOT_FOUND", "Document not found.");
  const file = await readBinaryBlob(doc.storageKey);
  if (!file) throw new AppError("NOT_FOUND", "File missing from storage.");
  return { doc, file };
}

export async function documentsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/documents", { preHandler: app.requireAuth }, async (req) => {
    const { user } = requireAuthContext(req);
    await ensureTermsPdfForUser({ repos: app.services.repos, userId: user.id });
    const docs = await listDocumentsForUser(user.id);
    return {
      documents: docs.map((d) => ({
        id: d.id,
        kind: d.kind,
        title: d.title,
        createdAt: d.createdAt,
      })),
    };
  });

  app.get("/v1/documents/:id/download", { preHandler: app.requireAuth }, async (req, reply) => {
    const { user } = requireAuthContext(req);
    const { doc, file } = await loadOwnedDocument(req, user.id);
    const filename = filenameFor(doc);
    reply.header("Content-Type", file.contentType ?? contentTypeFor(doc));
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    return reply.send(file.body);
  });

  /** Inline stream for in-browser View (PDF/images). Same auth as download. */
  app.get("/v1/documents/:id/view", { preHandler: app.requireAuth }, async (req, reply) => {
    const { user } = requireAuthContext(req);
    const { doc, file } = await loadOwnedDocument(req, user.id);
    const filename = filenameFor(doc);
    reply.header("Content-Type", file.contentType ?? contentTypeFor(doc));
    reply.header("Content-Disposition", `inline; filename="${filename}"`);
    reply.header("Cache-Control", "private, no-store");
    return reply.send(file.body);
  });
}
