import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

/**
 * Applies Drizzle SQL migrations from apps/api/drizzle in journal order.
 * Idempotent via a simple `_nivo_migrations` ledger (no drizzle-kit runtime dependency).
 */
export async function migrateDatabase(databaseUrl: string): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1 });
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS _nivo_migrations (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    const journalRaw = await readFile(join(root, "meta/_journal.json"), "utf8");
    const journal = JSON.parse(journalRaw) as {
      entries: { tag: string; idx: number }[];
    };
    const applied = new Set(
      (await sql<{ id: string }[]>`SELECT id FROM _nivo_migrations`).map((r) => r.id),
    );
    const entries = [...journal.entries].sort((a, b) => a.idx - b.idx);
    for (const entry of entries) {
      if (applied.has(entry.tag)) continue;
      const file = join(root, `${entry.tag}.sql`);
      const body = await readFile(file, "utf8");
      // drizzle emits statement-breakpoint separators
      const statements = body
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean);
      await sql.begin(async (tx) => {
        for (const stmt of statements) {
          await tx.unsafe(stmt);
        }
        await tx`INSERT INTO _nivo_migrations (id) VALUES (${entry.tag})`;
      });
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}
