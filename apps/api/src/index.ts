import { config as loadDotenv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { migrateDatabase } from "./db/migrate.js";
import { createLogger } from "./lib/logger.js";
import { bindDocumentsDb } from "./lib/documents-store.js";
import { bindProofsDb } from "./modules/proofs/store.js";
import { startRetentionWorker } from "./jobs/retention.js";
import { PostgresRepositories } from "./repositories/postgres.js";
import { bootstrapAdmin } from "./seed/bootstrap-admin.js";
import { seedDevData } from "./seed/dev-data.js";

// Load apps/api/.env into process.env before config parsing.
loadDotenv({ path: join(dirname(fileURLToPath(import.meta.url)), "../.env") });

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.LOG_LEVEL);

  if (!config.DATABASE_URL) {
    throw new Error("DATABASE_URL is required. Start Postgres (docker compose up -d) and set DATABASE_URL.");
  }

  await migrateDatabase(config.DATABASE_URL);
  logger.info("Database migrations applied");

  const dbHandle = createDb(config.DATABASE_URL);
  bindDocumentsDb(dbHandle.db);
  bindProofsDb(dbHandle.db);
  const repos = new PostgresRepositories(dbHandle.db);
  await repos.ensureDefaults();
  await bootstrapAdmin(repos, config, logger);

  const app = await buildApp({
    config,
    logger,
    repos,
    health: { dbCheck: () => dbHandle.ping() },
  });

  if (config.seedDevData) {
    const table = await seedDevData(app.services, config, repos);
    logger.info("Dev seed loaded");
    console.log(table);
  }

  const stopRetention = startRetentionWorker({
    db: dbHandle.db,
    repos,
    logger,
    encryptionSecret: config.IDENTITY_ENCRYPTION_KEY,
  });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    stopRetention();
    await app.close();
    await dbHandle.close();
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
