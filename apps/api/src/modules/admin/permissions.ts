import type { FastifyReply, FastifyRequest } from "fastify";
import { hasPermission, type Permission } from "@nivo/shared";
import { AppError } from "../../lib/errors.js";

/**
 * preHandler factory: 401 when unauthenticated, 403 when the session's role lacks `perm`.
 * Permissions are derived server-side from the user's role on every request.
 */
export function requirePermission(perm: Permission) {
  return async (req: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!req.auth) throw new AppError("UNAUTHORIZED", "Authentication required.");
    if (!hasPermission(req.auth.permissions, perm)) {
      await req.server.services.audit.append({
        actorId: req.auth.user.id,
        action: "admin.permission_denied",
        meta: { permission: perm, path: req.url.split("?")[0] },
      });
      throw new AppError("FORBIDDEN", "You do not have permission to perform this action.");
    }
  };
}
