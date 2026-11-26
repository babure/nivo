import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError, parseStrict } from "../../lib/errors.js";
import { requireAuthContext } from "../../plugins/auth.js";
import { requirePermission } from "../admin/permissions.js";
import { createProof, decideProof, getProof, listProofs } from "./store.js";

const keyParams = z.object({ key: z.string().regex(/^[a-z0-9_]{1,64}$/) });
const idParams = z.object({ id: z.string().uuid() });
const decideBody = z.object({
  decision: z.enum(["approved", "rejected"]),
  reviewNote: z
    .string()
    .trim()
    .max(500, "Note is too long (max 500 characters)")
    .optional(),
});

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

    // Move card into progress so the dashboard reflects the upload.
    try {
      const view = await cards.statusOf(user.id, key);
      if (view.status === "available") {
        await cards.setStatus(user.id, key, "in_progress");
      }
    } catch {
      /* card may be unknown / locked — proof is still stored */
    }

    await audit.append({
      actorId: user.id,
      action: "proofs.uploaded",
      entityType: "proof",
      entityId: proof.id,
      meta: { cardKey: key, fileId: saved.id },
    });
    return reply.code(201).send(proof);
  });

  /** Student: own proofs (for dashboard pending / rejected state). */
  app.get("/v1/me/proofs", { preHandler: app.requireAuth }, async (req) => {
    const { user } = requireAuthContext(req);
    const proofs = await listProofs({ userId: user.id });
    return {
      proofs: proofs.map((p) => ({
        id: p.id,
        cardKey: p.cardKey,
        status: p.status,
        reviewNote: p.status === "rejected" ? p.reviewNote : null,
        createdAt: p.createdAt,
      })),
    };
  });

  app.get("/v1/admin/proofs", { preHandler: [app.requireAuth, requirePermission("proofs:approve")] }, async (req) => {
    const status = (req.query as { status?: string }).status;
    const filter =
      status === "pending" || status === "approved" || status === "rejected"
        ? { status: status as "pending" | "approved" | "rejected" }
        : { status: "pending" as const };
    const proofs = await listProofs(filter);
    const users = await repos.users.list();
    const byId = new Map(users.map((u) => [u.id, u]));
    return {
      proofs: proofs.map((p) => {
        const student = byId.get(p.userId);
        return {
          ...p,
          studentEmail: student?.email ?? null,
          studentFullName: student?.fullName ?? null,
        };
      }),
    };
  });

  /** Admin: view / download the uploaded proof file. */
  app.get(
    "/v1/admin/proofs/:id/file",
    { preHandler: [app.requireAuth, requirePermission("proofs:approve")] },
    async (req, reply) => {
      const { id } = parseStrict(idParams, req.params);
      const proof = await getProof(id);
      if (!proof) throw new AppError("NOT_FOUND", "Proof not found.");
      if (!proof.fileId) throw new AppError("NOT_FOUND", "This proof has no file.");

      const file = await identity.getFileContentById(proof.fileId);
      if (file.userId !== proof.userId) {
        throw new AppError("NOT_FOUND", "Proof file not found.");
      }

      const disposition = (req.query as { download?: string }).download === "1" ? "attachment" : "inline";
      return reply
        .header("Content-Type", file.mime)
        .header("Content-Disposition", `${disposition}; filename="${file.filename}"`)
        .header("Cache-Control", "private, no-store")
        .send(file.body);
    },
  );

  app.post(
    "/v1/admin/proofs/:id/decide",
    { preHandler: [app.requireAuth, requirePermission("proofs:approve")] },
    async (req) => {
      const { id } = parseStrict(idParams, req.params);
      const body = parseStrict(decideBody, req.body);
      const { decision } = body;
      const note = body.reviewNote?.trim() ?? "";
      if (decision === "rejected" && note.length < 10) {
        throw new AppError("VALIDATION_FAILED", "Give the student a reason of at least 10 characters", [
          { path: "reviewNote", code: "too_small", message: "Give the student a reason of at least 10 characters" },
        ]);
      }
      const reviewNote = note.length > 0 ? note : null;
      const ctx = requireAuthContext(req);
      const existing = await getProof(id);
      if (!existing) throw new AppError("NOT_FOUND", "Proof not found.");
      if (existing.status !== "pending") throw new AppError("CONFLICT", "Proof already decided.");

      const updated = await decideProof(id, decision, ctx.user.id, reviewNote);
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
        meta: {
          cardKey: existing.cardKey,
          userId: existing.userId,
          ...(reviewNote ? { reviewNote } : {}),
        },
      });

      return { proof: updated };
    },
  );
}
