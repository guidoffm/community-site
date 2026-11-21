import { createHash, randomBytes } from "node:crypto";
import { and, asc, count, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, t } from "@/db";
import type { Actor } from "@/lib/auth/session";
import { AppError, forbidden, notFound } from "@/lib/errors";
import { slugify } from "@/lib/utils";
import { RESERVED_SUBDOMAINS, SLUG_RE, siteUrl } from "@/lib/domains";
import { enqueueMails } from "./outbox";
import { communityMails } from "./notifications";
import { removeImage } from "./images";

export async function listCommunities(actor: Actor | null) {
  return db()
    .select({
      id: t.communities.id,
      slug: t.communities.slug,
      title: t.communities.title,
      description: t.communities.description,
      joinMode: t.communities.joinMode,
      logoImageId: t.communities.logoImageId,
      memberCount: sql<number>`(select count(*)::int from memberships m where m.community_id = ${t.communities.id})`,
      isMember: actor
        ? sql<boolean>`exists(select 1 from memberships m where m.community_id = ${t.communities.id} and m.user_id = ${actor.userId})`
        : sql<boolean>`false`,
      hasRequested: actor
        ? sql<boolean>`exists(select 1 from join_requests j where j.community_id = ${t.communities.id} and j.user_id = ${actor.userId})`
        : sql<boolean>`false`,
    })
    .from(t.communities)
    .orderBy(asc(t.communities.title));
}

export async function getCommunity(slug: string) {
  const c = await db().query.communities.findFirst({ where: eq(t.communities.slug, slug) });
  if (!c) throw notFound("Community");
  return c;
}

export async function membershipOf(userId: string, communityId: string) {
  return db().query.memberships.findFirst({
    where: and(eq(t.memberships.userId, userId), eq(t.memberships.communityId, communityId)),
  });
}

/** Community laden und sicherstellen, dass der Actor Mitglied ist. */
export async function communityContext(actor: Actor, slug: string) {
  const community = await getCommunity(slug);
  const membership = await membershipOf(actor.userId, community.id);
  if (!membership) throw forbidden("Du bist kein Mitglied dieser Community.");
  return { community, membership };
}

export async function listMembers(communityId: string) {
  return db()
    .select({
      userId: t.users.id,
      name: t.users.name,
      role: t.memberships.role,
      joinedAt: t.memberships.joinedAt,
      hasHomepage: sql<boolean>`exists(select 1 from homepages h where h.user_id = ${t.users.id})`,
    })
    .from(t.memberships)
    .innerJoin(t.users, eq(t.users.id, t.memberships.userId))
    .where(eq(t.memberships.communityId, communityId))
    .orderBy(asc(t.users.name));
}

export async function memberCount(communityId: string) {
  const [r] = await db().select({ n: count() }).from(t.memberships).where(eq(t.memberships.communityId, communityId));
  return r.n;
}

export async function myCommunities(actor: Actor) {
  return (await listCommunities(actor)).filter((c) => c.isMember);
}

const createInput = z.object({
  title: z.string().trim().min(3, "Der Titel muss mindestens 3 Zeichen lang sein.").max(80),
  slug: z.string().trim().toLowerCase().optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
});

export async function createCommunity(actor: Actor, input: unknown) {
  if (!actor.isSiteAdmin) throw forbidden("Communities können nur von Site-Admins angelegt werden.");
  const data = createInput.parse(input);
  const slug = data.slug || slugify(data.title);
  if (!SLUG_RE.test(slug) || slug.length < 3 || slug.length > 50)
    throw new AppError("VALIDATION", "Die Adresse darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten (3–50 Zeichen).");
  if (RESERVED_SUBDOMAINS.has(slug)) throw new AppError("CONFLICT", `Die Adresse „${slug}“ ist reserviert.`);

  return db().transaction(async (tx) => {
    if (await tx.query.communities.findFirst({ where: eq(t.communities.slug, slug) }))
      throw new AppError("CONFLICT", `Die Adresse „${slug}“ ist bereits vergeben.`);
    const [c] = await tx
      .insert(t.communities)
      .values({ title: data.title, slug, description: data.description ?? "", createdBy: actor.userId })
      .returning();
    await tx.insert(t.memberships).values({ communityId: c.id, userId: actor.userId, role: "admin" });
    return c;
  });
}

export type JoinMode = "open" | "request" | "invite";
export const JOIN_MODES: Record<JoinMode, string> = {
  open: "Offen – jedes registrierte Mitglied kann beitreten",
  request: "Auf Anfrage – Admins entscheiden über Beitritte",
  invite: "Nur mit Einladung",
};

/**
 * Beitreten je nach Beitrittsmodus: offen → Mitglied, auf Anfrage → Anfrage an die Admins,
 * nur mit Einladung → Fehler. Rückgabe: "joined" | "requested".
 */
export async function joinCommunity(actor: Actor, communityId: string, message?: string | null): Promise<"joined" | "requested"> {
  const c = await db().query.communities.findFirst({ where: eq(t.communities.id, communityId) });
  if (!c) throw notFound("Community");
  if (await membershipOf(actor.userId, c.id)) return "joined";
  if (c.joinMode === "invite") throw new AppError("FORBIDDEN", "Dieser Community kann man nur mit Einladung beitreten.");
  if (c.joinMode === "open") {
    await db().insert(t.memberships).values({ communityId, userId: actor.userId }).onConflictDoNothing();
    return "joined";
  }
  await requestJoin(c, { id: actor.userId, name: actor.name }, message ?? null);
  return "requested";
}

/** Beitrittsanfrage stellen und Admins informieren (auch für Registrierung mit gewählten Communities). */
export async function requestJoin(c: { id: string; title: string; slug: string }, user: { id: string; name: string }, message: string | null) {
  await db().transaction(async (tx) => {
    const ins = await tx
      .insert(t.joinRequests)
      .values({ communityId: c.id, userId: user.id, message: message?.trim().slice(0, 500) || null })
      .onConflictDoNothing()
      .returning();
    if (!ins.length) return;
    const admins = await tx
      .select({ email: t.users.email, name: t.users.name })
      .from(t.memberships)
      .innerJoin(t.users, eq(t.users.id, t.memberships.userId))
      .where(and(eq(t.memberships.communityId, c.id), eq(t.memberships.role, "admin")));
    if (admins.length) await enqueueMails(communityMails.joinRequested(admins, c, user.name, ins[0].message), tx);
  });
}

export async function listJoinRequests(actor: Actor, slug: string) {
  const c = await manageContext(actor, slug);
  return db()
    .select({ userId: t.users.id, name: t.users.name, message: t.joinRequests.message, createdAt: t.joinRequests.createdAt })
    .from(t.joinRequests)
    .innerJoin(t.users, eq(t.users.id, t.joinRequests.userId))
    .where(eq(t.joinRequests.communityId, c.id))
    .orderBy(asc(t.joinRequests.createdAt));
}

export async function decideJoinRequest(actor: Actor, slug: string, userId: string, approve: boolean) {
  const c = await manageContext(actor, slug);
  await db().transaction(async (tx) => {
    const [r] = await tx
      .delete(t.joinRequests)
      .where(and(eq(t.joinRequests.communityId, c.id), eq(t.joinRequests.userId, userId)))
      .returning();
    if (!r) throw notFound("Beitrittsanfrage");
    if (approve) await tx.insert(t.memberships).values({ communityId: c.id, userId }).onConflictDoNothing();
    const [u] = await tx.select({ email: t.users.email, name: t.users.name }).from(t.users).where(eq(t.users.id, userId));
    if (u) await enqueueMails(communityMails.joinDecided(u, c, approve), tx);
  });
}

// ---------------------------------------------------------------- Mitglieder verwalten
export async function setMemberRole(actor: Actor, slug: string, userId: string, role: "admin" | "member") {
  const c = await manageContext(actor, slug);
  if (role === "member") await ensureAnotherAdmin(c.id, userId);
  const r = await db()
    .update(t.memberships)
    .set({ role })
    .where(and(eq(t.memberships.communityId, c.id), eq(t.memberships.userId, userId)))
    .returning();
  if (!r.length) throw notFound("Mitglied");
}

export async function removeMember(actor: Actor, slug: string, userId: string) {
  const c = await manageContext(actor, slug);
  await ensureAnotherAdmin(c.id, userId);
  const r = await db().delete(t.memberships).where(and(eq(t.memberships.communityId, c.id), eq(t.memberships.userId, userId))).returning();
  if (!r.length) throw notFound("Mitglied");
  const [u] = await db().select({ email: t.users.email, name: t.users.name }).from(t.users).where(eq(t.users.id, userId));
  if (u && userId !== actor.userId) await enqueueMails(communityMails.removed(u, c));
}

/** Die letzte Admin-Rolle einer Community darf nicht wegfallen. */
async function ensureAnotherAdmin(communityId: string, userId: string) {
  const m = await membershipOf(userId, communityId);
  if (m?.role !== "admin") return;
  const [r] = await db()
    .select({ n: count() })
    .from(t.memberships)
    .where(and(eq(t.memberships.communityId, communityId), eq(t.memberships.role, "admin")));
  if (r.n <= 1) throw new AppError("CONFLICT", "Die Community braucht mindestens einen Admin. Ernenne zuerst jemand anderen.");
}

// ---------------------------------------------------------------- Einladungen
const INVITE_TTL_MS = 14 * 86_400_000;
const LINK_TTL_MS = 90 * 86_400_000;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const inviteUrl = (token: string) => siteUrl(`/invite?token=${encodeURIComponent(token)}`);

/** Einladungen per E-Mail verschicken (einmalig nutzbar, 14 Tage gültig). */
export async function inviteByEmail(actor: Actor, slug: string, emailsRaw: string) {
  const c = await manageContext(actor, slug);
  const emails = [...new Set(emailsRaw.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const valid = emails.filter((e) => z.email().safeParse(e).success);
  if (!valid.length) throw new AppError("VALIDATION", "Bitte gib mindestens eine gültige E-Mail-Adresse an.");
  if (valid.length > 50) throw new AppError("VALIDATION", "Höchstens 50 Einladungen auf einmal.");
  const tokens: string[] = [];
  await db().transaction(async (tx) => {
    for (const email of valid) {
      const token = randomBytes(24).toString("base64url");
      tokens.push(token);
      await tx.insert(t.communityInvites).values({
        communityId: c.id,
        tokenHash: hashToken(token),
        kind: "email",
        email,
        createdBy: actor.userId,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      });
      await enqueueMails(communityMails.invite({ email, name: "" }, c, actor.name, inviteUrl(token)), tx);
    }
  });
  return { sent: valid.length, invalid: emails.filter((e) => !valid.includes(e)), tokens };
}

/** Teilbaren Einladungslink erzeugen (ersetzt den bisherigen; 90 Tage gültig). */
export async function createInviteLink(actor: Actor, slug: string) {
  const c = await manageContext(actor, slug);
  const token = randomBytes(24).toString("base64url");
  await db().transaction(async (tx) => {
    await tx
      .update(t.communityInvites)
      .set({ revokedAt: new Date() })
      .where(and(eq(t.communityInvites.communityId, c.id), eq(t.communityInvites.kind, "link"), isNull(t.communityInvites.revokedAt)));
    await tx.insert(t.communityInvites).values({
      communityId: c.id,
      tokenHash: hashToken(token),
      kind: "link",
      createdBy: actor.userId,
      expiresAt: new Date(Date.now() + LINK_TTL_MS),
    });
  });
  return inviteUrl(token);
}

export async function revokeInviteLinks(actor: Actor, slug: string) {
  const c = await manageContext(actor, slug);
  await db()
    .update(t.communityInvites)
    .set({ revokedAt: new Date() })
    .where(and(eq(t.communityInvites.communityId, c.id), eq(t.communityInvites.kind, "link"), isNull(t.communityInvites.revokedAt)));
}

export async function inviteStatus(actor: Actor, slug: string) {
  const c = await manageContext(actor, slug);
  const rows = await db()
    .select()
    .from(t.communityInvites)
    .where(and(eq(t.communityInvites.communityId, c.id), isNull(t.communityInvites.revokedAt), gt(t.communityInvites.expiresAt, new Date())));
  return {
    activeLink: rows.find((r) => r.kind === "link") ?? null,
    pendingEmails: rows.filter((r) => r.kind === "email" && !r.usedAt).map((r) => ({ email: r.email!, expiresAt: r.expiresAt })),
  };
}

async function findInvite(token: string) {
  const inv = await db().query.communityInvites.findFirst({
    where: and(eq(t.communityInvites.tokenHash, hashToken(token)), isNull(t.communityInvites.revokedAt), gt(t.communityInvites.expiresAt, new Date())),
  });
  if (!inv || (inv.kind === "email" && inv.usedAt)) return null;
  const c = await db().query.communities.findFirst({ where: eq(t.communities.id, inv.communityId) });
  return c ? { invite: inv, community: c } : null;
}

export async function peekInvite(token: string) {
  const r = await findInvite(token);
  return r ? { title: r.community.title, slug: r.community.slug, description: r.community.description, logoImageId: r.community.logoImageId } : null;
}

/** Einladung annehmen – unabhängig vom Beitrittsmodus. */
export async function acceptInvite(actor: Actor, token: string) {
  const r = await findInvite(token);
  if (!r) throw new AppError("NOT_FOUND", "Die Einladung ist ungültig, abgelaufen oder wurde bereits verwendet.");
  await db().transaction(async (tx) => {
    await tx.insert(t.memberships).values({ communityId: r.community.id, userId: actor.userId }).onConflictDoNothing();
    await tx.delete(t.joinRequests).where(and(eq(t.joinRequests.communityId, r.community.id), eq(t.joinRequests.userId, actor.userId)));
    if (r.invite.kind === "email") await tx.update(t.communityInvites).set({ usedAt: new Date() }).where(eq(t.communityInvites.id, r.invite.id));
  });
  return r.community;
}

// ---------------------------------------------------------------- Logo & Titelbild
export async function removeCommunityImage(actor: Actor, slug: string, kind: "logo" | "cover") {
  const c = await manageContext(actor, slug);
  const old = kind === "logo" ? c.logoImageId : c.coverImageId;
  await db()
    .update(t.communities)
    .set(kind === "logo" ? { logoImageId: null } : { coverImageId: null })
    .where(eq(t.communities.id, c.id));
  if (old) await removeImage(old).catch(() => null);
}

export async function leaveCommunity(actor: Actor, communityId: string) {
  await db().delete(t.memberships).where(and(eq(t.memberships.communityId, communityId), eq(t.memberships.userId, actor.userId)));
}

/** Darf der Actor die Community verwalten (Titel/Beschreibung)? Site-Admins immer, sonst Community-Admins. */
export function canManage(actor: Actor | null, membership: { role: "admin" | "member" } | null | undefined) {
  return !!actor && (actor.isSiteAdmin || membership?.role === "admin");
}

export async function manageContext(actor: Actor, slug: string) {
  const community = await getCommunity(slug);
  const membership = await membershipOf(actor.userId, community.id);
  if (!canManage(actor, membership)) throw forbidden("Nur Admins dürfen die Community bearbeiten.");
  return community;
}

const updateInput = z.object({
  title: z.string().trim().min(3, "Der Titel muss mindestens 3 Zeichen lang sein.").max(80),
  description: z.string().trim().max(2000).nullable().transform((v) => v ?? ""),
  joinMode: z.enum(["open", "request", "invite"]).optional(),
});

/** Titel, Beschreibung und Beitrittsmodus ändern. Der Slug bleibt fest (Subdomain). */
export async function updateCommunity(actor: Actor, slug: string, input: unknown) {
  const community = await manageContext(actor, slug);
  const data = updateInput.parse(input);
  const [c] = await db().update(t.communities).set({ ...data, updatedAt: new Date() }).where(eq(t.communities.id, community.id)).returning();
  return c;
}
