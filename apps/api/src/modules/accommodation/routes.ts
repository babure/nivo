import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { phoneSchema } from "@nivo/shared";
import { z } from "zod";
import { AppError, parseStrict } from "../../lib/errors.js";
import { LEAD_STATUSES } from "../../repositories/types.js";
import { requireAuthContext } from "../../plugins/auth.js";
import { requirePermission } from "../admin/permissions.js";

const leadBody = z.object({
  city: z.string().trim().min(2).max(80),
  budget: z.string().trim().min(1).max(40),
  roomType: z.string().trim().min(1).max(40),
  phone: phoneSchema,
  notes: z.string().trim().max(1000).optional(),
});
const idParams = z.object({ id: z.string().uuid() });
const statusBody = z.object({ status: z.enum(LEAD_STATUSES) });

export async function accommodationRoutes(app: FastifyInstance): Promise<void> {
  const { repos, accommodation } = app.services;

  app.post(
    "/v1/accommodation/leads",
    { preHandler: app.requireAuth, config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
    async (req, reply) => {
      const input = parseStrict(leadBody, req.body);
      const result = await accommodation.submit(requireAuthContext(req).user.id, input);
      return reply.code(201).send(result);
    },
  );

  app.get(
    "/v1/accommodation/leads",
    { preHandler: [app.requireAuth, requirePermission("leads:read")] },
    async () => ({ leads: await repos.leads.list() }),
  );

  app.patch(
    "/v1/accommodation/leads/:id",
    { preHandler: [app.requireAuth, requirePermission("leads:update_status")] },
    async (req) => {
      const { id } = parseStrict(idParams, req.params);
      const { status } = parseStrict(statusBody, req.body);
      if (!(await repos.leads.get(id))) throw new AppError("NOT_FOUND", "Lead not found.");
      await accommodation.updateStatus(requireAuthContext(req).user.id, id, status);
      return repos.leads.get(id);
    },
  );

  app.post(
    "/v1/accommodation/leads/:id/notes",
    { preHandler: [app.requireAuth, requirePermission("leads:update_status")] },
    async (req, reply) => {
      const { id } = parseStrict(idParams, req.params);
      const { body } = parseStrict(z.object({ body: z.string().trim().min(1).max(2000) }), req.body);
      if (!(await repos.leads.get(id))) throw new AppError("NOT_FOUND", "Lead not found.");
      await repos.leads.addNote({
        id: randomUUID(),
        leadId: id,
        authorId: requireAuthContext(req).user.id,
        body,
        createdAt: new Date(),
      });
      return reply.code(201).send({ status: "added" });
    },
  );
}
