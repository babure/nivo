import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDocument, listDocumentsForUser } from "../../lib/documents-store.js";
import { AppError, parseStrict } from "../../lib/errors.js";
import { invoicePdfAbsolutePath } from "../../lib/invoice-pdf.js";
import { requireAuthContext } from "../../plugins/auth.js";

const idParams = z.object({ id: z.string().uuid() });

export async function documentsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/v1/documents", { preHandler: app.requireAuth }, async (req) => {
    const { user } = requireAuthContext(req);
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
    const { id } = parseStrict(idParams, req.params);
    const { user } = requireAuthContext(req);
    const doc = await getDocument(id);
    if (!doc || doc.userId !== user.id) throw new AppError("NOT_FOUND", "Document not found.");

    const abs = invoicePdfAbsolutePath(doc.storageKey);
    try {
      await access(abs);
    } catch {
      throw new AppError("NOT_FOUND", "File missing from storage.");
    }

    const filename = doc.kind === "invoice_pdf" ? `${doc.title}.pdf` : `${doc.title}`;
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    return reply.send(createReadStream(abs));
  });
}
