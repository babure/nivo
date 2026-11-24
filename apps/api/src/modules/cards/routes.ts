import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parseStrict } from "../../lib/errors.js";
import { requireAuthContext } from "../../plugins/auth.js";

const keyParams = z.object({ key: z.string().regex(/^[a-z0-9_]{1,64}$/) });
const statusBody = z.object({ status: z.enum(["in_progress", "completed"]) });

export async function cardsRoutes(app: FastifyInstance): Promise<void> {
  const { cards } = app.services;

  app.get("/v1/cards", { preHandler: app.requireAuth }, async (req) => {
    return { cards: await cards.list(requireAuthContext(req).user.id) };
  });

  app.get("/v1/cards/:key", { preHandler: app.requireAuth }, async (req) => {
    const { key } = parseStrict(keyParams, req.params);
    return cards.statusOf(requireAuthContext(req).user.id, key);
  });

  app.post("/v1/cards/:key/status", { preHandler: app.requireAuth }, async (req) => {
    const { key } = parseStrict(keyParams, req.params);
    const { status } = parseStrict(statusBody, req.body);
    return cards.setStatus(requireAuthContext(req).user.id, key, status);
  });

  app.post("/v1/cards/:key/notify", { preHandler: app.requireAuth }, async (req, reply) => {
    const { key } = parseStrict(keyParams, req.params);
    const { created } = await cards.requestNotify(requireAuthContext(req).user.id, key);
    return reply.code(created ? 201 : 200).send({ status: "subscribed" });
  });
}
