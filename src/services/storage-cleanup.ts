// Bild-Objekte im Speicher löschen. Die Keys werden zuerst in storage_deletions vorgemerkt (in derselben
// Transaktion wie das Löschen der DB-Zeilen), dann sofort gelöscht; was dabei scheitert, holt der Job nach.
import { inArray } from "drizzle-orm";
import { db, t, type Db } from "@/db";
import { deleteObjects, imageKeys } from "@/lib/images";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export async function scheduleImageDeletion(tx: Tx, imageIds: string[]) {
  const keys = imageIds.flatMap(imageKeys);
  if (keys.length) await tx.insert(t.storageDeletions).values(keys.map((key) => ({ key }))).onConflictDoNothing();
  return keys;
}

export async function deleteScheduled(keys: string[]) {
  if (!keys.length) return 0;
  try {
    await deleteObjects(keys);
    await db().delete(t.storageDeletions).where(inArray(t.storageDeletions.key, keys));
    return keys.length;
  } catch (e) {
    console.error("[storage] Löschen fehlgeschlagen – wird vom Job storage-cleanup nachgeholt", e);
    return 0;
  }
}

/** Job: alle vorgemerkten Objekte löschen. */
export async function processStorageDeletions() {
  let deleted = 0;
  for (;;) {
    const rows = await db().select({ key: t.storageDeletions.key }).from(t.storageDeletions).limit(500);
    if (!rows.length) break;
    const n = await deleteScheduled(rows.map((r) => r.key));
    if (!n) return { deleted, errors: ["Speicher nicht erreichbar"] };
    deleted += n;
  }
  return { deleted };
}
