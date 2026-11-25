import type { FastifyInstance } from "fastify";
import { csvRow } from "../../lib/csv.js";
import { AppError } from "../../lib/errors.js";
import { requireAuthContext } from "../../plugins/auth.js";

/**
 * Consultancy portal: members only see students attributed to their own consultancy
 * (tenant-isolated), pseudonymised; contact details only for students who opted in.
 */
export async function consultancyRoutes(app: FastifyInstance): Promise<void> {
  const { repos, consultancy } = app.services;

  app.get("/v1/consultancy/dashboard", { preHandler: app.requireAuth }, async (req) => {
    const { user } = requireAuthContext(req);
    const membership = await repos.consultancies.getMembership(user.id);
    if (!membership) throw new AppError("FORBIDDEN", "Not a consultancy member.");
    // The consultancy id always comes from the session's membership, never from the client.
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
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", 'attachment; filename="consultancy-students.csv"');
    return reply.send(rows.join("\n"));
  });
}
