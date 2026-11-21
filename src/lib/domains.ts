/**
 * Domains:
 *   APP_URL      Hauptseite, z. B. https://www.15k.de
 *   ROOT_DOMAIN  Basis für Community-Subdomains, z. B. 15k.de → https://<slug>.15k.de
 * Wird auch im Proxy (Edge-kompatibel) genutzt – keine Node-Imports.
 */
export const APP_URL = (process.env.APP_URL ?? "http://www.lvh.me:3000").replace(/\/+$/, "");
export const APP_NAME = process.env.APP_NAME ?? "15k";

/** Betreiber und Pflichtangaben (Impressum § 5 DDG, Datenschutzerklärung Art. 13 DSGVO) */
export const OPERATOR_NAME = process.env.OPERATOR_NAME ?? "Altiros GmbH";
export const IMPRINT_URL = process.env.IMPRINT_URL ?? "https://www.altiros.com/imprint";
export const PRIVACY_URL = process.env.PRIVACY_URL ?? "https://www.altiros.com/privacy";

const appUrl = new URL(APP_URL);
export const PROTOCOL = appUrl.protocol;
export const MAIN_HOST = appUrl.host;
export const ROOT_DOMAIN = (process.env.ROOT_DOMAIN ?? MAIN_HOST.replace(/^www\./, "")).toLowerCase();

/** Subdomains, die nicht als Community-Slug vergeben werden dürfen. */
export const RESERVED_SUBDOMAINS = new Set([
  "www", "api", "app", "admin", "mail", "smtp", "imap", "pop", "ftp", "static", "cdn", "assets", "images", "img",
  "s3", "minio", "auth", "login", "dev", "test", "staging", "status", "help", "support", "blog", "webmail", "ns1", "ns2",
]);

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Absolute URL auf der Hauptseite. */
export const siteUrl = (path = "/") => `${APP_URL}${path}`;

/** Absolute URL einer Community-Subdomain, z. B. communityUrl("lauftreff", "/events/123"). */
export const communityUrl = (slug: string, path = "/") => `${PROTOCOL}//${slug}.${ROOT_DOMAIN}${path}`;

/** Community-Slug zu einem Host oder null (Hauptseite/fremder Host). */
export function slugFromHost(host: string | null): string | null {
  if (!host) return null;
  const h = host.toLowerCase();
  const suffix = `.${ROOT_DOMAIN}`;
  if (!h.endsWith(suffix)) return null;
  const sub = h.slice(0, -suffix.length);
  return SLUG_RE.test(sub) && !RESERVED_SUBDOMAINS.has(sub) ? sub : null;
}

/** Nur Ziele auf der eigenen Domain (Open-Redirect-Schutz). Ergebnis ist immer absolut. */
export function safeRedirectTarget(value: unknown): string {
  const v = typeof value === "string" ? value : "";
  if (v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\")) return siteUrl(v);
  try {
    const u = new URL(v);
    if (u.protocol === PROTOCOL && (u.host === MAIN_HOST || slugFromHost(u.host))) return u.toString();
  } catch {
    /* ungültig */
  }
  return siteUrl("/");
}
