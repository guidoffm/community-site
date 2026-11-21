import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { db, t } from "@/db";
import { DELETED_USER_ID } from "@/db/schema";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { blockedFor, clearFailures, recordFailure } from "@/lib/auth/rate-limit";
import { notifyEmailVerification } from "./notifications";

/** Frist für die Bestätigung der E-Mail-Adresse; danach löscht der Job unverified-cleanup das Konto. */
export const VERIFICATION_TTL_MS = 24 * 3_600_000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const registerInput = z.object({
  name: z.string().trim().min(2, "Bitte gib deinen Namen an.").max(80),
  email: z.email("Bitte gib eine gültige E-Mail-Adresse an.").transform((e) => e.trim().toLowerCase()),
  password: z.string().min(8, "Das Passwort muss mindestens 8 Zeichen lang sein.").max(200),
  communityIds: z.array(z.uuid()).default([]),
  next: z.string().max(500).nullable().optional(),
});

/**
 * Registrierung: legt ein unbestätigtes Konto an (kein Login, keine Mitgliedschaften) und verschickt
 * einen Bestätigungslink (24 h gültig). Gibt es bereits ein unbestätigtes Konto mit der Adresse,
 * wird es überschrieben und ein neuer Link verschickt – die Adresse gehört erst nach Bestätigung jemandem.
 * Rückgabe enthält das Token nur für Tests (smoke); die Web-Action verwirft es.
 */
export async function register(input: unknown, ip: string) {
  const data = registerInput.parse(input);
  const ipKey = `register:ip:${ip}`;
  const mailKey = `register:email:${data.email}`;
  const wait = await blockedFor([[ipKey, 10], [mailKey, 3]]);
  if (wait) throw new AppError("FORBIDDEN", `Zu viele Registrierungen. Bitte in ${wait} Minuten erneut versuchen.`);
  await recordFailure(ipKey, mailKey); // zählt jede Registrierung (Schutz vor Mail-Bombing)

  const token = randomBytes(32).toString("base64url");
  const user = await db().transaction(async (tx) => {
    const existing = await tx.query.users.findFirst({ where: eq(t.users.email, data.email) });
    if (existing?.emailVerifiedAt) throw new AppError("CONFLICT", "Für diese E-Mail-Adresse existiert bereits ein Konto.");

    const values = { name: data.name, email: data.email, passwordHash: await hashPassword(data.password) };
    const [user] = existing
      ? await tx.update(t.users).set({ ...values, createdAt: new Date() }).where(eq(t.users.id, existing.id)).returning()
      : await tx.insert(t.users).values(values).returning();

    const cs = data.communityIds.length
      ? await tx.select({ id: t.communities.id }).from(t.communities).where(inArray(t.communities.id, data.communityIds))
      : [];
    await tx.delete(t.emailVerifications).where(eq(t.emailVerifications.userId, user.id));
    await tx.insert(t.emailVerifications).values({
      tokenHash: hashToken(token),
      userId: user.id,
      communityIds: cs.map((c) => c.id),
      next: data.next || null,
      expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
    });
    await notifyEmailVerification(tx, { email: user.email, name: user.name }, token);
    return user;
  });
  return { user, token };
}

/** Prüft ein Bestätigungs-Token, ohne es zu verbrauchen (Anzeige der Bestätigungsseite). */
export async function peekVerification(token: string) {
  const v = await db().query.emailVerifications.findFirst({
    where: and(eq(t.emailVerifications.tokenHash, hashToken(token)), gt(t.emailVerifications.expiresAt, new Date())),
  });
  if (!v) return null;
  const user = await db().query.users.findFirst({ where: eq(t.users.id, v.userId), columns: { name: true, email: true } });
  return user ? { name: user.name, email: user.email } : null;
}

/** Bestätigt die E-Mail-Adresse: Konto freischalten, gewählten Communities beitreten. */
export async function verifyEmail(token: string) {
  return db().transaction(async (tx) => {
    const [v] = await tx
      .delete(t.emailVerifications)
      .where(and(eq(t.emailVerifications.tokenHash, hashToken(token)), gt(t.emailVerifications.expiresAt, new Date())))
      .returning();
    if (!v) throw new AppError("NOT_FOUND", "Der Bestätigungslink ist ungültig oder abgelaufen. Bitte registriere dich erneut.");
    const [current] = await tx.select({ email: t.users.email }).from(t.users).where(eq(t.users.id, v.userId));
    const [user] = await tx
      .update(t.users)
      .set({ emailVerifiedAt: new Date(), ...(env.siteAdminEmails().includes(current.email) ? { isSiteAdmin: true } : {}) })
      .where(eq(t.users.id, v.userId))
      .returning();
    if (v.communityIds.length) {
      const cs = await tx.select({ id: t.communities.id }).from(t.communities).where(inArray(t.communities.id, v.communityIds));
      if (cs.length) await tx.insert(t.memberships).values(cs.map((c) => ({ communityId: c.id, userId: user.id }))).onConflictDoNothing();
    }
    return { user, next: v.next };
  });
}

/** Job unverified-cleanup: Konten löschen, deren Registrierung nicht innerhalb von 24 h bestätigt wurde. */
export async function deleteUnverifiedUsers() {
  const cutoff = new Date(Date.now() - VERIFICATION_TTL_MS);
  const deleted = await db()
    .delete(t.users)
    .where(and(isNull(t.users.emailVerifiedAt), lt(t.users.createdAt, cutoff)))
    .returning({ id: t.users.id });
  const tokens = await db().delete(t.emailVerifications).where(lt(t.emailVerifications.expiresAt, new Date())).returning({ h: t.emailVerifications.tokenHash });
  return { usersDeleted: deleted.length, expiredLinksDeleted: tokens.length };
}

export async function authenticate(emailRaw: string, password: string, ip: string) {
  const email = emailRaw.trim().toLowerCase();
  const keys = [`login:ip:${ip}`, `login:email:${email}`];
  const wait = await blockedFor([[keys[0], 20], [keys[1], 5]]);
  if (wait) throw new AppError("FORBIDDEN", `Zu viele Fehlversuche. Bitte in ${wait} Minuten erneut versuchen.`);

  const user = await db().query.users.findFirst({ where: eq(t.users.email, email) });
  const valid = !!user && user.id !== DELETED_USER_ID && user.passwordHash.startsWith("$2") && (await verifyPassword(password, user.passwordHash));
  if (!user || !valid) {
    await recordFailure(...keys);
    throw new AppError("UNAUTHORIZED", "E-Mail oder Passwort ist falsch.");
  }
  if (!user.emailVerifiedAt)
    throw new AppError(
      "FORBIDDEN",
      "Bitte bestätige zuerst deine E-Mail-Adresse über den Link in unserer Mail. Keine Mail bekommen? Registriere dich einfach erneut.",
    );
  await clearFailures(keys[1]);
  return user;
}

/** Beim Start: Rolle Site-Admin an die in SITE_ADMIN_EMAILS genannten (bestätigten) Konten vergeben. */
export async function grantConfiguredSiteAdmins() {
  const emails = env.siteAdminEmails();
  if (!emails.length) return 0;
  const r = await db()
    .update(t.users)
    .set({ isSiteAdmin: true })
    .where(and(inArray(t.users.email, emails), isNotNull(t.users.emailVerifiedAt), eq(t.users.isSiteAdmin, false)))
    .returning({ id: t.users.id });
  return r.length;
}
