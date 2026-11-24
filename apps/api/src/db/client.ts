import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Db = PostgresJsDatabase<typeof schema>;

export type DbHandle = {
  db: Db;
  /** Cheap connectivity probe used by /health/ready. */
  ping(): Promise<boolean>;
  close(): Promise<void>;
};

/** Lazily connects: postgres-js only opens sockets on first query. */
export function createDb(databaseUrl: string, opts: { max?: number } = {}): DbHandle {
  const sql = postgres(databaseUrl, {
    max: opts.max ?? 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: true,
  });
  const db = drizzle(sql, { schema });
  return {
    db,
    async ping() {
      try {
        await sql`select 1`;
        return true;
      } catch {
        return false;
      }
    },
    close: () => sql.end({ timeout: 5 }),
  };
}

export { schema };
