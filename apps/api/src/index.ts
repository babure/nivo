import { config as loadDotenv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { createLogger } from "./lib/logger.js";
import { InMemoryRepositories } from "./repositories/memory.js";
import { seedDevData } from "./seed/dev-data.js";

// Load apps/api/.env into process.env before config parsing.
loadDotenv({ path: join(dirname(fileURLToPath(import.meta.url)), "../.env") });

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.LOG_LEVEL);

  // Postgres-backed repositories are not implemented yet: the API runs on the in-memory
  // repositories (data is lost on restart). Refuse to do that in production.
  if (config.isProd) {
    throw new Error(
      "Refusing to start in production: Drizzle repositories are not implemented yet (in-memory store only).",
    );
  }
  logger.warn("Using in-memory repositories (development only; data is not persisted).");

  const repos = new InMemoryRepositories();
  const dbHandle = config.DATABASE_URL ? createDb(config.DATABASE_URL) : null;
  const app = await buildApp({
    config,
    logger,
    repos,
    health: dbHandle ? { dbCheck: () => dbHandle.ping() } : {},
  });

  if (config.seedDevData) {
    const table = await seedDevData(app.services, config, repos);
    logger.info("Dev seed loaded");
    console.log(table);
  }

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    await dbHandle?.close();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ host: config.HOST, port: config.PORT });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
