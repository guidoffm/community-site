// Zentrale Konfiguration. Werte werden erst zur Laufzeit gelesen (nicht beim Build).
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Umgebungsvariable ${name} fehlt`);
  return v;
}

export const env = {
  databaseUrl: () => required("DATABASE_URL"),
  dbPoolMax: () => Number(process.env.DB_POOL_MAX ?? 5),
  sessionSecret: () => {
    const s = required("SESSION_SECRET");
    if (s.length < 32) throw new Error("SESSION_SECRET muss mindestens 32 Zeichen lang sein");
    return new TextEncoder().encode(s);
  },
  migrationsDir: () => process.env.MIGRATIONS_DIR ?? `${process.cwd()}/drizzle`,
  /** "web" (Benutzeranfragen), "worker" (Mail-Outbox, Jobs) oder "all" (Entwicklung) */
  appRole: () => (process.env.APP_ROLE ?? "all") as "all" | "web" | "worker",
  secureCookies: () => process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "true",
  /** z. B. ".15k.de" – Session gilt auf allen Community-Subdomains */
  cookieDomain: () => process.env.COOKIE_DOMAIN || undefined,
};
