import type { FastifyInstance } from "fastify";
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
}
