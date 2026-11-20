import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

const g = globalThis as unknown as { __db?: Db; __pool?: Pool };

export function db(): Db {
  if (!g.__db) {
    g.__pool = new Pool({ connectionString: env.databaseUrl(), max: env.dbPoolMax(), idleTimeoutMillis: 30_000 });
    g.__db = drizzle(g.__pool, { schema });
  }
  return g.__db;
}

export function pool(): Pool {
  db();
  return g.__pool!;
}

/**
 * Prozessübergreifende Sperre über Postgres-Advisory-Locks (mehrere Replikas).
 * wait=true wartet auf die Sperre, sonst wird fn übersprungen, wenn ein anderer Pod sie hält.
 */
export async function withAdvisoryLock<T>(
  key: string,
  fn: () => Promise<T>,
  opts: { wait?: boolean } = {},
): Promise<{ skipped: true } | { skipped: false; value: T }> {
  const client = await pool().connect();
  let locked = false;
  try {
    if (opts.wait) {
      await client.query("select pg_advisory_lock(hashtext($1))", [key]);
      locked = true;
    } else {
      locked = (await client.query<{ ok: boolean }>("select pg_try_advisory_lock(hashtext($1)) as ok", [key])).rows[0].ok;
      if (!locked) return { skipped: true };
    }
    return { skipped: false, value: await fn() };
  } finally {
    if (locked) await client.query("select pg_advisory_unlock(hashtext($1))", [key]).catch(() => {});
    client.release();
  }
}

export { schema as t };
