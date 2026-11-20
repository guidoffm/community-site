// Lokaler Entwicklungs-Postgres ohne Docker (Port 54330).
// Daten bewusst AUSSERHALB des Projekts: liegen sie im Projektordner, sieht der Next-Dev-Server
// jede DB-Schreiboperation als Dateiänderung und lädt die Seite endlos neu.
import EmbeddedPostgres from "embedded-postgres";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";

const dir = process.env.DEV_PG_DIR ?? `${homedir()}/.local/share/community-site/dev-pg`;
mkdirSync(`${dir}/..`, { recursive: true });
const pg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "postgres", port: 54330, persistent: true });

if (!existsSync(dir)) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase("community");
} catch {
  /* existiert bereits */
}
console.log("Postgres läuft auf localhost:54330 (postgres/postgres). Strg+C zum Beenden.");
const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
