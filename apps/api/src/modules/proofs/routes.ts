import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError, parseStrict } from "../../lib/errors.js";
import { requireAuthContext } from "../../plugins/auth.js";
import { requirePermission } from "../admin/permissions.js";
import { createProof, decideProof, getProof, listProofs } from "./store.js";

const keyParams = z.object({ key: z.string().regex(/^[a-z0-9_]{1,64}$/) });
const idParams = z.object({ id: z.string().uuid() });
const decideBody = z.object({ decision: z.enum(["approved", "rejected"]) });

export async function proofsRoutes(app: FastifyInstance): Promise<void> {
  const { repos, cards, audit, identity } = app.services;

  /** Student uploads completion proof for a card (e.g. blocked_account). */
  app.post("/v1/cards/:key/proof", { preHandler: app.requireAuth }, async (req, reply) => {
    const { key } = parseStrict(keyParams, req.params);
    const { user } = requireAuthContext(req);
    const profile = await repos.profiles.get(user.id);
    if (!profile || profile.paymentStatus !== "paid") {
      throw new AppError("PAYMENT_REQUIRED", "Activate your account before uploading proof.");
    }

    const file = await req.file();
    if (!file) throw new AppError("VALIDATION_FAILED", "Proof file is required.");
    const buf = await file.toBuffer();
    const saved = await identity.addFile(user.id, "completion_proof", buf);
    const proof = await createProof({ userId: user.id, cardKey: key, fileId: saved.id });
    await audit.append({
      actorId: user.id,
      action: "proofs.uploaded",
      entityType: "proof",
      entityId: proof.id,
      meta: { cardKey: key, fileId: saved.id },
    });
    return reply.code(201).send(proof);
  });

  app.get("/v1/admin/proofs", { preHandler: [app.requireAuth, requirePermission("proofs:approve")] }, async (req) => {
    const status = (req.query as { status?: string }).status;
    const filter =
      status === "pending" || status === "approved" || status === "rejected"
        ? { status: status as "pending" | "approved" | "rejected" }
        : { status: "pending" as const };
    return { proofs: await listProofs(filter) };
  });

  app.post(
    "/v1/admin/proofs/:id/decide",
    { preHandler: [app.requireAuth, requirePermission("proofs:approve")] },
    async (req) => {
      const { id } = parseStrict(idParams, req.params);
      const { decision } = parseStrict(decideBody, req.body);
      const ctx = requireAuthContext(req);
      const existing = await getProof(id);
      if (!existing) throw new AppError("NOT_FOUND", "Proof not found.");
      if (existing.status !== "pending") throw new AppError("CONFLICT", "Proof already decided.");

      const updated = await decideProof(id, decision, ctx.user.id);
      if (!updated) throw new AppError("CONFLICT", "Proof already decided.");

      if (decision === "approved") {
        await cards.setStatus(existing.userId, existing.cardKey, "completed", {
          actorId: ctx.user.id,
          bypassStudentLimits: true,
        });
      }

      await audit.append({
        actorId: ctx.user.id,
        action: decision === "approved" ? "proofs.approved" : "proofs.rejected",
        entityType: "proof",
        entityId: id,
        meta: { cardKey: existing.cardKey, userId: existing.userId },
      });

      return { proof: updated };
    },
  );
}
