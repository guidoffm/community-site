// Anmeldung per Passkey (WebAuthn). Relying Party = ROOT_DOMAIN (15k.de) → gilt für www und alle Subdomains.
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { and, asc, eq, gt, lt } from "drizzle-orm";
import { db, t } from "@/db";
import type { Actor } from "@/lib/auth/session";
import { AppError, notFound } from "@/lib/errors";
import { APP_NAME, APP_URL, MAIN_HOST, ROOT_DOMAIN } from "@/lib/domains";

const RP_ID = ROOT_DOMAIN.replace(/:\d+$/, "");
const ORIGINS = [APP_URL, `${new URL(APP_URL).protocol}//${MAIN_HOST}`];
const CHALLENGE_TTL_MS = 5 * 60_000;

const b64url = (u: Uint8Array) => Buffer.from(u).toString("base64url");
const fromB64url = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));

async function storeChallenge(challenge: string, kind: string, userId: string | null) {
  await db().delete(t.authChallenges).where(lt(t.authChallenges.expiresAt, new Date()));
  const [c] = await db()
    .insert(t.authChallenges)
    .values({ challenge, kind, userId, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) })
    .returning({ id: t.authChallenges.id });
  return c.id;
}

/** Challenge einmalig verbrauchen */
async function takeChallenge(id: string | undefined, kind: string) {
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) throw new AppError("VALIDATION", "Sitzung abgelaufen. Bitte erneut versuchen.");
  const [c] = await db()
    .delete(t.authChallenges)
    .where(and(eq(t.authChallenges.id, id), eq(t.authChallenges.kind, kind), gt(t.authChallenges.expiresAt, new Date())))
    .returning();
  if (!c) throw new AppError("VALIDATION", "Sitzung abgelaufen. Bitte erneut versuchen.");
  return c;
}

export async function listPasskeys(userId: string) {
  return db()
    .select({ id: t.passkeys.id, name: t.passkeys.name, createdAt: t.passkeys.createdAt, lastUsedAt: t.passkeys.lastUsedAt, backedUp: t.passkeys.backedUp })
    .from(t.passkeys)
    .where(eq(t.passkeys.userId, userId))
    .orderBy(asc(t.passkeys.createdAt));
}

// ---------------------------------------------------------------- Einrichten
export async function startRegistration(actor: Actor) {
  const existing = await listPasskeys(actor.userId);
  const options = await generateRegistrationOptions({
    rpName: APP_NAME,
    rpID: RP_ID,
    userName: actor.email,
    userDisplayName: actor.name,
    userID: new TextEncoder().encode(actor.userId),
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.id })),
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
  const challengeId = await storeChallenge(options.challenge, "passkey-register", actor.userId);
  return { options, challengeId };
}

export async function finishRegistration(actor: Actor, challengeId: string | undefined, response: RegistrationResponseJSON, nameRaw: string) {
  const c = await takeChallenge(challengeId, "passkey-register");
  if (c.userId !== actor.userId) throw new AppError("FORBIDDEN", "Ungültige Sitzung.");
  const r = await verifyRegistrationResponse({
    response,
    expectedChallenge: c.challenge,
    expectedOrigin: ORIGINS,
    expectedRPID: RP_ID,
    requireUserVerification: false,
  }).catch((e) => {
    throw new AppError("VALIDATION", `Passkey konnte nicht geprüft werden: ${(e as Error).message}`);
  });
  if (!r.verified) throw new AppError("VALIDATION", "Passkey konnte nicht bestätigt werden.");
  const { credential, credentialDeviceType, credentialBackedUp } = r.registrationInfo;
  const name = nameRaw.trim().slice(0, 60) || (credentialBackedUp ? "Passkey (synchronisiert)" : "Passkey");
  await db()
    .insert(t.passkeys)
    .values({
      id: credential.id,
      userId: actor.userId,
      publicKey: b64url(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? null,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      name,
    })
    .onConflictDoNothing();
}

export async function deletePasskey(actor: Actor, id: string) {
  const r = await db().delete(t.passkeys).where(and(eq(t.passkeys.id, id), eq(t.passkeys.userId, actor.userId))).returning();
  if (!r.length) throw notFound("Passkey");
}

// ---------------------------------------------------------------- Anmelden
export async function startLogin() {
  // ohne allowCredentials: der Browser bietet die gespeicherten Passkeys für 15k.de an (Discoverable Credentials)
  const options = await generateAuthenticationOptions({ rpID: RP_ID, userVerification: "preferred" });
  const challengeId = await storeChallenge(options.challenge, "passkey-login", null);
  return { options, challengeId };
}

export async function finishLogin(challengeId: string | undefined, response: AuthenticationResponseJSON) {
  const c = await takeChallenge(challengeId, "passkey-login");
  const pk = await db().query.passkeys.findFirst({ where: eq(t.passkeys.id, response.id) });
  if (!pk) throw new AppError("UNAUTHORIZED", "Dieser Passkey ist bei uns nicht (mehr) hinterlegt.");
  const r = await verifyAuthenticationResponse({
    response,
    expectedChallenge: c.challenge,
    expectedOrigin: ORIGINS,
    expectedRPID: RP_ID,
    credential: { id: pk.id, publicKey: fromB64url(pk.publicKey), counter: pk.counter, transports: (pk.transports ?? undefined) as never },
    requireUserVerification: false,
  }).catch(() => ({ verified: false }) as { verified: false });
  if (!r.verified) throw new AppError("UNAUTHORIZED", "Anmeldung mit Passkey fehlgeschlagen.");
  await db()
    .update(t.passkeys)
    .set({ counter: "authenticationInfo" in r ? r.authenticationInfo.newCounter : pk.counter, lastUsedAt: new Date() })
    .where(eq(t.passkeys.id, pk.id));
  const user = await db().query.users.findFirst({ where: eq(t.users.id, pk.userId) });
  if (!user?.emailVerifiedAt) throw new AppError("UNAUTHORIZED", "Konto nicht aktiv.");
  if (user.blockedAt) throw new AppError("FORBIDDEN", "Dieses Konto ist gesperrt. Bei Fragen: mail@altiros.de");
  return user;
}
