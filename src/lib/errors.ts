export type ErrorCode = "NOT_FOUND" | "FORBIDDEN" | "UNAUTHORIZED" | "VALIDATION" | "CONFLICT" | "UNAVAILABLE";

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what: string) => new AppError("NOT_FOUND", `${what} nicht gefunden`);
export const forbidden = (msg = "Keine Berechtigung") => new AppError("FORBIDDEN", msg);

/** Übersetzt bekannte Postgres-Fehler in verständliche AppErrors. */
export function translateDbError(err: unknown): unknown {
  // drizzle verpackt pg-Fehler in DrizzleQueryError (.cause)
  const e = (err as { cause?: unknown })?.cause ?? err;
  const pg = e as { code?: string; detail?: string; constraint?: string };
  if (pg?.code === "23505") return new AppError("CONFLICT", `Wert bereits vorhanden${pg.detail ? `: ${pg.detail}` : ""}`);
  if (pg?.code === "23503" || pg?.code === "23001")
    return new AppError("CONFLICT", "Datensatz wird noch verwendet oder Referenz existiert nicht" + (pg.detail ? `: ${pg.detail}` : ""));
  if (pg?.code === "23514") return new AppError("VALIDATION", `Prüfregel verletzt (${pg.constraint ?? "check"})`);
  return err;
}

export function errorMessage(err: unknown): string {
  if (err instanceof AppError) return err.message;
  if (err && typeof err === "object" && "issues" in err) {
    const issues = (err as { issues: { path: PropertyKey[]; message: string }[] }).issues;
    return issues.map((i) => `${i.path.map(String).join(".") || "Eingabe"}: ${i.message}`).join("; ");
  }
  return err instanceof Error ? err.message : String(err);
}

/** Für Seiten: NOT_FOUND (und FORBIDDEN, um nichts preiszugeben) aus Services → 404-Seite */
export async function orNotFound<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof AppError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) {
      const { notFound } = await import("next/navigation");
      notFound();
    }
    throw e;
  }
}
