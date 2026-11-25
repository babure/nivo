import type { FastifyInstance } from "fastify";

export type HealthDeps = {
  /** Resolves true when the datastore is reachable. Omit for in-memory mode. */
  dbCheck?: () => Promise<boolean>;
  version?: string;
};

export function healthRoutes(deps: HealthDeps = {}) {
  return async function register(app: FastifyInstance): Promise<void> {
    const version = deps.version ?? process.env.npm_package_version ?? "0.0.1";

    const live = async () => ({
      status: "ok",
      service: "nivo-api",
      version,
      uptimeSeconds: Math.round(process.uptime()),
    });

    // Liveness aliases (LLD uses /healthz).
    app.get("/health", live);
    app.get("/healthz", live);

    const ready = async (_req: unknown, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) => {
      const dbUp = deps.dbCheck ? await deps.dbCheck() : null;
      const ok = dbUp !== false;
      return reply.code(ok ? 200 : 503).send({
        status: ok ? "ready" : "degraded",
        checks: { database: dbUp === null ? "in-memory" : dbUp ? "up" : "down" },
      });
    };

    // Readiness aliases (LLD uses /readyz).
    app.get("/health/ready", ready);
    app.get("/readyz", ready);
  };
}
