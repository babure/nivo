import type { FastifyInstance } from "fastify";
import { identitySchema } from "@nivo/shared";
import { z } from "zod";
import { AppError, parseStrict } from "../../lib/errors.js";
import { requireAuthContext } from "../../plugins/auth.js";
import { FILE_KINDS, MAX_UPLOAD_BYTES } from "./service.js";

const uploadQuery = z.object({ kind: z.enum(FILE_KINDS) });

export async function identityRoutes(app: FastifyInstance): Promise<void> {
  const { identity } = app.services;

  app.get("/v1/identity", { preHandler: app.requireAuth }, async (req) => {
    return identity.getMasked(requireAuthContext(req).user.id);
  });

  app.put("/v1/identity", { preHandler: app.requireAuth }, async (req, reply) => {
    const input = parseStrict(identitySchema, req.body);
    await identity.save(requireAuthContext(req).user.id, input);
    return reply.code(204).send();
  });

  app.get("/v1/identity/export", { preHandler: app.requireAuth }, async (req) => {
    return identity.exportForUser(requireAuthContext(req).user.id);
  });

  app.post(
    "/v1/identity/files",
    { preHandler: app.requireAuth, config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const { kind } = parseStrict(uploadQuery, req.query);
      if (!req.isMultipart()) throw new AppError("UPLOAD_REJECTED", "Expected multipart/form-data.");

      const part = await req.file({ limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0 } });
      if (!part) throw new AppError("UPLOAD_REJECTED", "No file provided.");
      const data = await part.toBuffer();
      if (part.file.truncated) throw new AppError("UPLOAD_REJECTED", "File exceeds 5 MB.");

      const saved = await identity.addFile(requireAuthContext(req).user.id, kind, data);
      return reply.code(201).send(saved);
    },
  );
}
