import { and, eq, isNull, lt } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { Db } from "../db/client.js";
import * as s from "../db/schema.js";
import { removeStorageKey } from "../lib/storage.js";
import type { PostgresRepositories } from "../repositories/postgres.js";

/** Provisional: purge unverified accounts after 7 days; process deletion requests; identity hard-cap 90d. */
const UNVERIFIED_DAYS = 7;
const IDENTITY_HARD_CAP_DAYS = 90;
const INTERVAL_MS = 60 * 60 * 1000;

export function startRetentionWorker(opts: {
  db: Db;
  repos: PostgresRepositories;
  logger: FastifyBaseLogger;
  encryptionSecret: string;
}): () => void {
  let stopped = false;
  const run = async () => {
    if (stopped) return;
    try {
      await purgeUnverified(opts.db, opts.logger);
      await processDeletions(opts.db, opts.logger);
      await purgeStaleIdentity(opts.db, opts.logger);
    } catch (err) {
      opts.logger.error({ err }, "retention worker failed");
    }
  };
  void run();
  const handle = setInterval(() => void run(), INTERVAL_MS);
  handle.unref?.();
  return () => {
    stopped = true;
    clearInterval(handle);
  };
}

async function purgeUnverified(db: Db, logger: FastifyBaseLogger): Promise<void> {
  const cutoff = new Date(Date.now() - UNVERIFIED_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ id: s.users.id })
    .from(s.users)
    .where(and(isNull(s.users.emailVerifiedAt), lt(s.users.createdAt, cutoff), isNull(s.users.deletedAt)));
  for (const row of rows) {
    await db.update(s.users).set({ deletedAt: new Date(), email: `deleted+${row.id}@purged.nivo` }).where(eq(s.users.id, row.id));
    await db.delete(s.sessions).where(eq(s.sessions.userId, row.id));
    logger.info({ userId: row.id }, "purged unverified account");
  }
}

async function processDeletions(db: Db, logger: FastifyBaseLogger): Promise<void> {
  const pending = await db
    .select()
    .from(s.deletionRequests)
    .where(eq(s.deletionRequests.status, "pending"))
    .limit(20);
  for (const req of pending) {
    const files = await db.select().from(s.identityFiles).where(eq(s.identityFiles.userId, req.userId));
    for (const f of files) {
      await removeStorageKey(f.storageKey);
    }
    await db.delete(s.identityFiles).where(eq(s.identityFiles.userId, req.userId));
    await db.delete(s.identityRecords).where(eq(s.identityRecords.userId, req.userId));
    await db
      .update(s.users)
      .set({
        deletedAt: new Date(),
        fullName: "Deleted User",
        phone: "",
        email: `deleted+${req.userId}@erased.nivo`,
        passwordHash: "!",
        googleSub: null,
        avatarUrl: null,
      })
      .where(eq(s.users.id, req.userId));
    await db.delete(s.sessions).where(eq(s.sessions.userId, req.userId));
    await db
      .update(s.deletionRequests)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(s.deletionRequests.id, req.id));
    logger.info({ userId: req.userId, requestId: req.id }, "processed deletion request");
  }
}

async function purgeStaleIdentity(db: Db, logger: FastifyBaseLogger): Promise<void> {
  const cutoff = new Date(Date.now() - IDENTITY_HARD_CAP_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ userId: s.identityRecords.userId })
    .from(s.identityRecords)
    .where(lt(s.identityRecords.updatedAt, cutoff));
  for (const row of rows) {
    const files = await db.select().from(s.identityFiles).where(eq(s.identityFiles.userId, row.userId));
    for (const f of files) await removeStorageKey(f.storageKey);
    await db.delete(s.identityFiles).where(eq(s.identityFiles.userId, row.userId));
    await db.delete(s.identityRecords).where(eq(s.identityRecords.userId, row.userId));
    // One-way latch (REQ-ID-10): never clear identityComplete / never relock Available cards.
    logger.info({ userId: row.userId }, "purged identity past hard-cap retention");
  }
}

/** Exported for tests */
export const retentionDefaults = { UNVERIFIED_DAYS, IDENTITY_HARD_CAP_DAYS };
