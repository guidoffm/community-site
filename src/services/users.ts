import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { and, eq, gt, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db, t } from "@/db";
import { DELETED_USER_ID } from "@/db/schema";
import { env } from "@/lib/env";
import { MIN_AGE, TERMS_VERSION } from "@/lib/terms";
import { AppError } from "@/lib/errors";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { blockedFor, clearFailures, recordFailure } from "@/lib/auth/rate-limit";
import { notifyEmailVerification, notifyLoginCode, notifyPasswordReset } from "./notifications";
import { requestJoin } from "./communities";

/** Frist für die Bestätigung der E-Mail-Adresse; danach löscht der Job unverified-cleanup das Konto. */
export const VERIFICATION_TTL_MS = 24 * 3_600_000;
/** Platzhalter-Hash: kein Passwort gesetzt */
export const NO_PASSWORD = "!";
export const hasPassword = (u: { passwordHash: string }) => u.passwordHash.startsWith("$2");

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const registerInput = z.object({
  name: z.string().trim().min(2, "Bitte gib deinen Namen an.").max(80),
  email: z.email("Bitte gib eine gültige E-Mail-Adresse an.").transform((e) => e.trim().toLowerCase()),
  /** optional: ohne Passwort meldet man sich per Passkey oder E-Mail-Code an */
  password: z.union([z.literal(""), z.string().min(8, "Das Passwort muss mindestens 8 Zeichen lang sein.").max(200)]).nullable().optional(),
  communityIds: z.array(z.uuid()).default([]),
  next: z.string().max(500).nullable().optional(),
  acceptTerms: z.literal(true, { error: "Bitte stimme den Nutzungsbedingungen zu." }),
  ageConfirmed: z.literal(true, { error: `Die Nutzung ist erst ab ${MIN_AGE} Jahren erlaubt.` }),
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

    const values = {
      name: data.name,
      email: data.email,
      passwordHash: data.password ? await hashPassword(data.password) : NO_PASSWORD,
      termsAcceptedAt: new Date(),
      termsVersion: TERMS_VERSION,
    };
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
    const cs = v.communityIds.length
      ? await tx.select().from(t.communities).where(inArray(t.communities.id, v.communityIds))
      : [];
    const open = cs.filter((c) => c.joinMode === "open");
    if (open.length) await tx.insert(t.memberships).values(open.map((c) => ({ communityId: c.id, userId: user.id }))).onConflictDoNothing();
    return { user, next: v.next, requestCommunities: cs.filter((c) => c.joinMode === "request") };
  }).then(async (r) => {
    // Communities „auf Anfrage“: Anfrage stellen (nach dem Commit, eigene Transaktion je Anfrage)
    for (const c of r.requestCommunities) await requestJoin(c, { id: r.user.id, name: r.user.name }, null);
    return { user: r.user, next: r.next };
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
  const resets = await db().delete(t.passwordResets).where(lt(t.passwordResets.expiresAt, new Date())).returning({ h: t.passwordResets.tokenHash });
  const codes = await db().delete(t.loginCodes).where(lt(t.loginCodes.expiresAt, new Date())).returning({ id: t.loginCodes.id });
  await db().delete(t.authChallenges).where(lt(t.authChallenges.expiresAt, new Date()));
  return { usersDeleted: deleted.length, expiredLinksDeleted: tokens.length + resets.length + codes.length };
}

export async function authenticate(emailRaw: string, password: string, ip: string) {
  const email = emailRaw.trim().toLowerCase();
  const keys = [`login:ip:${ip}`, `login:email:${email}`];
  const wait = await blockedFor([[keys[0], 20], [keys[1], 5]]);
  if (wait) throw new AppError("FORBIDDEN", `Zu viele Fehlversuche. Bitte in ${wait} Minuten erneut versuchen.`);

  const user = await db().query.users.findFirst({ where: eq(t.users.email, email) });
  const valid = !!user && user.id !== DELETED_USER_ID && hasPassword(user) && (await verifyPassword(password, user.passwordHash));
  if (!user || !valid) {
    await recordFailure(...keys);
    throw new AppError("UNAUTHORIZED", "E-Mail oder Passwort ist falsch.");
  }
  if (user.blockedAt) throw new AppError("FORBIDDEN", "Dieses Konto ist gesperrt. Bei Fragen: mail@altiros.de");
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

// ---------------------------------------------------------------- Passwort zurücksetzen / ändern
export const PASSWORD_RESET_TTL_MS = 3_600_000;
const passwordSchema = z.string().min(8, "Das Passwort muss mindestens 8 Zeichen lang sein.").max(200);

/**
 * Link zum Zurücksetzen anfordern. Antwortet immer gleich (verrät nicht, ob es die Adresse gibt).
 * Rückgabe enthält das Token nur für Tests; die Web-Action verwirft es.
 */
export async function requestPasswordReset(emailRaw: string, ip: string): Promise<{ token?: string }> {
  const email = String(emailRaw ?? "").trim().toLowerCase();
  const keys: [string, number][] = [[`pwreset:ip:${ip}`, 10], [`pwreset:email:${email}`, 3]];
  const wait = await blockedFor(keys);
  if (wait) throw new AppError("FORBIDDEN", `Zu viele Anfragen. Bitte in ${wait} Minuten erneut versuchen.`);
  await recordFailure(...keys.map(([k]) => k));
  if (!z.email().safeParse(email).success) return {};

  const user = await db().query.users.findFirst({ where: eq(t.users.email, email) });
  if (!user?.emailVerifiedAt) return {};
  const token = randomBytes(32).toString("base64url");
  await db().transaction(async (tx) => {
    await tx.delete(t.passwordResets).where(eq(t.passwordResets.userId, user.id));
    await tx.insert(t.passwordResets).values({ tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS) });
    await notifyPasswordReset(tx, { email: user.email, name: user.name }, token);
  });
  return { token };
}

export async function peekPasswordReset(token: string) {
  const r = await db().query.passwordResets.findFirst({
    where: and(eq(t.passwordResets.tokenHash, hashToken(token)), gt(t.passwordResets.expiresAt, new Date())),
  });
  if (!r) return null;
  const user = await db().query.users.findFirst({ where: eq(t.users.id, r.userId), columns: { email: true, name: true } });
  return user ?? null;
}

/** Neues Passwort setzen. Alle bestehenden Sitzungen werden dadurch ungültig. */
export async function resetPassword(token: string, newPassword: unknown) {
  const password = passwordSchema.parse(newPassword);
  return db().transaction(async (tx) => {
    const [r] = await tx
      .delete(t.passwordResets)
      .where(and(eq(t.passwordResets.tokenHash, hashToken(token)), gt(t.passwordResets.expiresAt, new Date())))
      .returning();
    if (!r) throw new AppError("NOT_FOUND", "Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.");
    const [user] = await tx
      .update(t.users)
      .set({ passwordHash: await hashPassword(password), passwordChangedAt: new Date() })
      .where(eq(t.users.id, r.userId))
      .returning();
    await tx.delete(t.passwordResets).where(eq(t.passwordResets.userId, user.id));
    return user;
  });
}

/** Passwort ändern (angemeldet, mit aktuellem Passwort). Andere Sitzungen werden ungültig. */
export async function changePassword(userId: string, current: string, next: unknown) {
  const password = passwordSchema.parse(next);
  const key = `pwchange:${userId}`;
  const wait = await blockedFor([[key, 5]]);
  if (wait) throw new AppError("FORBIDDEN", `Zu viele Fehlversuche. Bitte in ${wait} Minuten erneut versuchen.`);
  const user = await db().query.users.findFirst({ where: eq(t.users.id, userId) });
  // Wer noch kein Passwort hat (Passkey/E-Mail-Code), kann direkt eins festlegen
  if (!user || (hasPassword(user) && !(await verifyPassword(current, user.passwordHash)))) {
    await recordFailure(key);
    throw new AppError("UNAUTHORIZED", "Das aktuelle Passwort ist falsch.");
  }
  await db().update(t.users).set({ passwordHash: await hashPassword(password), passwordChangedAt: new Date() }).where(eq(t.users.id, userId));
  await clearFailures(key);
}

// ---------------------------------------------------------------- Anmeldung per E-Mail-Code
export const LOGIN_CODE_TTL_MS = 10 * 60_000;
const LOGIN_CODE_MAX_ATTEMPTS = 5;
const codeHash = (email: string, code: string) =>
  createHash("sha256").update(`${process.env.SESSION_SECRET ?? ""}:${email}:${code}`).digest("hex");

/** Code anfordern. Antwortet immer gleich; Rückgabe enthält den Code nur für Tests. */
export async function requestLoginCode(emailRaw: string, ip: string): Promise<{ code?: string }> {
  const email = String(emailRaw ?? "").trim().toLowerCase();
  const keys: [string, number][] = [[`logincode:ip:${ip}`, 10], [`logincode:email:${email}`, 5]];
  const wait = await blockedFor(keys);
  if (wait) throw new AppError("FORBIDDEN", `Zu viele Anfragen. Bitte in ${wait} Minuten erneut versuchen.`);
  await recordFailure(...keys.map(([k]) => k));
  if (!z.email().safeParse(email).success) return {};
  const user = await db().query.users.findFirst({ where: eq(t.users.email, email) });
  if (!user?.emailVerifiedAt || user.id === DELETED_USER_ID) return {};

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db().transaction(async (tx) => {
    await tx.delete(t.loginCodes).where(eq(t.loginCodes.email, email));
    await tx.insert(t.loginCodes).values({ email, codeHash: codeHash(email, code), expiresAt: new Date(Date.now() + LOGIN_CODE_TTL_MS) });
    await notifyLoginCode(tx, { email: user.email, name: user.name }, code);
  });
  return { code };
}

export async function verifyLoginCode(emailRaw: string, codeRaw: string, ip: string) {
  const email = String(emailRaw ?? "").trim().toLowerCase();
  const code = String(codeRaw ?? "").replace(/\s+/g, "");
  const wait = await blockedFor([[`logincode-verify:ip:${ip}`, 20]]);
  if (wait) throw new AppError("FORBIDDEN", `Zu viele Fehlversuche. Bitte in ${wait} Minuten erneut versuchen.`);
  const fail = async (id?: string) => {
    await recordFailure(`logincode-verify:ip:${ip}`);
    if (id) await db().update(t.loginCodes).set({ attempts: sql`${t.loginCodes.attempts} + 1` }).where(eq(t.loginCodes.id, id));
    return new AppError("UNAUTHORIZED", "Der Code ist falsch oder abgelaufen.");
  };
  const row = await db().query.loginCodes.findFirst({
    where: and(eq(t.loginCodes.email, email), gt(t.loginCodes.expiresAt, new Date())),
  });
  if (!row || row.attempts >= LOGIN_CODE_MAX_ATTEMPTS || !/^\d{6}$/.test(code)) throw await fail(row?.id);
  const a = Buffer.from(row.codeHash);
  const b = Buffer.from(codeHash(email, code));
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw await fail(row.id);

  await db().delete(t.loginCodes).where(eq(t.loginCodes.email, email));
  const user = await db().query.users.findFirst({ where: eq(t.users.email, email) });
  if (!user?.emailVerifiedAt) throw new AppError("UNAUTHORIZED", "Konto nicht aktiv.");
  if (user.blockedAt) throw new AppError("FORBIDDEN", "Dieses Konto ist gesperrt. Bei Fragen: mail@altiros.de");
  return user;
}

export async function acceptTerms(userId: string) {
  await db().update(t.users).set({ termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION }).where(eq(t.users.id, userId));
}
