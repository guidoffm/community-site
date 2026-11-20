// Läuft einmal beim Serverstart: DB migrieren (nur ein Pod gleichzeitig), Worker-Schleifen starten.
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, withAdvisoryLock } from "@/db";
import { env } from "@/lib/env";
import { startOutboxWorker } from "@/services/outbox";
import { grantConfiguredSiteAdmins } from "@/services/users";

export async function init() {
  await withAdvisoryLock(
    "community:init",
    async () => {
      await migrate(db(), { migrationsFolder: env.migrationsDir() });
      console.log("[init] Datenbank migriert");
      const admins = await grantConfiguredSiteAdmins();
      if (admins) console.log(`[init] Rolle Site-Admin an ${admins} Konto/Konten vergeben`);
    },
    { wait: true },
  );
  if (env.appRole() !== "web") startOutboxWorker();
  console.log(`[init] bereit (Rolle ${env.appRole()})`);
}

export async function initOrExit() {
  try {
    await init();
  } catch (e) {
    console.error("[init] Start fehlgeschlagen", e);
    process.exit(1);
  }
}
