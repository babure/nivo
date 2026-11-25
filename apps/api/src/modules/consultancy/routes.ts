import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { csvRow } from "../../lib/csv.js";
import { AppError, parseStrict } from "../../lib/errors.js";
import { requireAuthContext } from "../../plugins/auth.js";

/**
 * Consultancy portal: members only see students attributed to their own consultancy
 * (tenant-isolated), pseudonymised; contact details only for students who opted in.
 */
export async function consultancyRoutes(app: FastifyInstance): Promise<void> {
  const { repos, consultancy, audit } = app.services;

  /** Public preview for register / join pages — never leaks student data. */
  app.get("/v1/consultancy/lookup", async (req) => {
    const code = String((req.query as { code?: string }).code ?? "");
    return consultancy.lookupByCode(code);
  });

  app.get("/v1/consultancy/dashboard", { preHandler: app.requireAuth }, async (req) => {
    const { user } = requireAuthContext(req);
    const membership = await repos.consultancies.getMembership(user.id);
    if (!membership) throw new AppError("FORBIDDEN", "Not a consultancy member.");
    return consultancy.dashboard(membership.consultancyId);
  });

  /** Formula-safe limited CSV (REQ-CON-07). */
  app.get("/v1/consultancy/export.csv", { preHandler: app.requireAuth }, async (req, reply) => {
    const { user } = requireAuthContext(req);
    const membership = await repos.consultancies.getMembership(user.id);
    if (!membership) throw new AppError("FORBIDDEN", "Not a consultancy member.");
    const dash = await consultancy.dashboard(membership.consultancyId);
    const rows = [
      csvRow(["pseudoId", "displayName", "country", "intake", "stage", "email", "phone"]),
      ...dash.students.map((s) =>
        csvRow([
          s.pseudoId,
          s.displayName,
          s.country,
          s.intake,
          s.stage,
          s.email ?? "",
          s.phone ?? "",
        ]),
      ),
    ];
    await audit.append({
      actorId: user.id,
      action: "exports.consultancy",
      entityType: "consultancy",
      entityId: membership.consultancyId,
      meta: { rows: rows.length - 1 },
    });
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", 'attachment; filename="consultancy-students.csv"');
    return reply.send(rows.join("\n"));
  });
}

export const lookupQuerySchema = z.object({
  code: z
    .string()
    .trim()
    .max(32, "Referral code is too long")
    .regex(/^[A-Za-z0-9_-]*$/, "Use letters, numbers, underscore or hyphen only")
    .optional(),
});
