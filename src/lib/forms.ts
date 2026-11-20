import { errorMessage } from "./errors";

export type ActionState = { error?: string; ok?: string; data?: Record<string, unknown>; at?: number };

/** FormData → Objekt. Leere Strings werden zu null (bzw. weggelassen bei skipEmpty). */
export function formObject(
  fd: FormData,
  opts: { bool?: string[]; int?: string[]; skipEmpty?: string[] } = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$")) continue; // Next.js-interne Felder
    if (typeof v !== "string") continue;
    if (opts.bool?.includes(k)) continue;
    if (v === "" && opts.skipEmpty?.includes(k)) continue;
    if (opts.int?.includes(k)) out[k] = v === "" ? null : Number(v);
    else out[k] = v === "" ? null : v;
  }
  for (const k of opts.bool ?? []) out[k] = fd.get(k) === "true";
  return out;
}

/** Führt eine Server-Action aus und wandelt Fehler in eine Meldung um. */
export async function run(fn: () => Promise<string | void | ActionState>): Promise<ActionState> {
  try {
    const r = await fn();
    if (typeof r === "string") return { ok: r, at: Date.now() };
    return { ok: "Gespeichert", ...(r ?? {}), at: Date.now() };
  } catch (e) {
    // redirect()/notFound() von Next.js durchreichen
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
    return { error: errorMessage(e), at: Date.now() };
  }
}
