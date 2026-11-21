import "server-only";
import { eq } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, t } from "@/db";
import { env } from "@/lib/env";
import { siteUrl } from "@/lib/domains";

/** Wer handelt gerade */
export interface Actor {
  userId: string;
  email: string;
  name: string;
  /** darf Communities anlegen */
  isSiteAdmin: boolean;
}

const COOKIE = "c15k_session";
const MAX_AGE = 60 * 60 * 24 * 30;

const cookieOpts = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.secureCookies(),
  path: "/",
  // gemeinsames Cookie für www.15k.de und alle <slug>.15k.de
  domain: env.cookieDomain(),
});

export async function createSession(userId: string) {
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(env.sessionSecret());
  (await cookies()).set(COOKIE, jwt, { ...cookieOpts(), maxAge: MAX_AGE });
}

export async function destroySession() {
  (await cookies()).set(COOKIE, "", { ...cookieOpts(), maxAge: 0 });
}

export async function getActor(): Promise<Actor | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, env.sessionSecret());
    if (!payload.sub) return null;
    const user = await db().query.users.findFirst({ where: eq(t.users.id, payload.sub) });
    if (!user?.emailVerifiedAt) return null;
    if (user.passwordChangedAt && (payload.iat ?? 0) < Math.floor(user.passwordChangedAt.getTime() / 1000)) return null;
    return { userId: user.id, email: user.email, name: user.name, isSiteAdmin: user.isSiteAdmin };
  } catch {
    return null;
  }
}

/** Aktuelle absolute URL (Host + Pfad), für Login-Rücksprung. Der Proxy setzt x-url. */
async function currentUrl() {
  const h = await headers();
  return h.get("x-url") ?? siteUrl("/");
}

/** Für Seiten/Server-Actions: angemeldeter Benutzer oder Redirect auf die Login-Seite (mit Rücksprung). */
export async function requireActor(): Promise<Actor> {
  const a = await getActor();
  if (!a) redirect(siteUrl(`/login?next=${encodeURIComponent(await currentUrl())}`));
  return a;
}

// ---------------------------------------------------------------- WebAuthn-Challenge (ID im kurzlebigen Cookie)
const WA_COOKIE = "c15k_wa";
export async function setChallengeCookie(id: string) {
  (await cookies()).set(WA_COOKIE, id, { httpOnly: true, sameSite: "strict", secure: env.secureCookies(), path: "/", maxAge: 300 });
}
export async function takeChallengeCookie() {
  const jar = await cookies();
  const v = jar.get(WA_COOKIE)?.value;
  jar.set(WA_COOKIE, "", { httpOnly: true, sameSite: "strict", secure: env.secureCookies(), path: "/", maxAge: 0 });
  return v;
}
