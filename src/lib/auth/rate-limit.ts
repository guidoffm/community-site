// Begrenzung von Fehlversuchen über die Datenbank – gilt über alle Replikas hinweg.
// Fenster 15 Minuten; alte Einträge löscht der Job "cleanup".
import { and, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { db, t } from "@/db";

export const WINDOW_MS = 15 * 60_000;

/** Gibt die Wartezeit in Minuten zurück, wenn einer der Schlüssel sein Limit erreicht hat, sonst 0. */
export async function blockedFor(limits: [key: string, max: number][]): Promise<number> {
  const d = db();
  const since = new Date(Date.now() - WINDOW_MS);
  let waitMs = 0;
  for (const [key, max] of limits) {
    // der max-t-jüngste Versuch im Fenster bestimmt, wann wieder Platz ist
    const rows = await d
      .select({ at: t.rateLimitHits.createdAt })
      .from(t.rateLimitHits)
      .where(and(eq(t.rateLimitHits.key, key), gt(t.rateLimitHits.createdAt, since)))
      .orderBy(desc(t.rateLimitHits.createdAt))
      .offset(max - 1)
      .limit(1);
    if (rows[0]) waitMs = Math.max(waitMs, WINDOW_MS - (Date.now() - rows[0].at.getTime()));
  }
  return waitMs > 0 ? Math.ceil(waitMs / 60_000) : 0;
}

export async function recordFailure(...keys: string[]) {
  if (!keys.length) return;
  await db().insert(t.rateLimitHits).values(keys.map((key) => ({ key })));
}

export async function clearFailures(...keys: string[]) {
  if (!keys.length) return;
  await db().delete(t.rateLimitHits).where(inArray(t.rateLimitHits.key, keys));
}

/** Für den Aufräum-Job: Einträge außerhalb jedes Fensters löschen. */
export async function purgeRateLimits(olderThanMs = 24 * 3_600_000) {
  const r = await db()
    .delete(t.rateLimitHits)
    .where(lt(t.rateLimitHits.createdAt, new Date(Date.now() - olderThanMs)))
    .returning({ id: t.rateLimitHits.id });
  return r.length;
}
