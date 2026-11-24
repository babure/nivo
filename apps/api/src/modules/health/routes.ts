import type { FastifyInstance } from "fastify";

export type HealthDeps = {
  /** Resolves true when the datastore is reachable. Omit for in-memory mode. */
  dbCheck?: () => Promise<boolean>;
  version?: string;
};

export function healthRoutes(deps: HealthDeps = {}) {
  return async function register(app: FastifyInstance): Promise<void> {
    const version = deps.version ?? process.env.npm_package_version ?? "0.0.1";

    // Liveness: process is up. No dependencies touched.
    app.get("/health", async () => ({
      status: "ok",
      service: "nivo-api",
      version,
      uptimeSeconds: Math.round(process.uptime()),
    }));

    // Readiness: dependencies reachable.
    app.get("/health/ready", async (_req, reply) => {
      const dbUp = deps.dbCheck ? await deps.dbCheck() : null;
      const ready = dbUp !== false;
      return reply.code(ready ? 200 : 503).send({
        status: ready ? "ready" : "degraded",
        checks: { database: dbUp === null ? "in-memory" : dbUp ? "up" : "down" },
      });
    });
  };
}
