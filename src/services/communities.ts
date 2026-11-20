import { and, asc, count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, t } from "@/db";
import type { Actor } from "@/lib/auth/session";
import { AppError, forbidden, notFound } from "@/lib/errors";
import { slugify } from "@/lib/utils";
import { RESERVED_SUBDOMAINS, SLUG_RE } from "@/lib/domains";

export async function listCommunities(actor: Actor | null) {
  return db()
    .select({
      id: t.communities.id,
      slug: t.communities.slug,
      title: t.communities.title,
      description: t.communities.description,
      memberCount: sql<number>`(select count(*)::int from memberships m where m.community_id = ${t.communities.id})`,
      isMember: actor
        ? sql<boolean>`exists(select 1 from memberships m where m.community_id = ${t.communities.id} and m.user_id = ${actor.userId})`
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

export async function joinCommunity(actor: Actor, communityId: string) {
  await db().insert(t.memberships).values({ communityId, userId: actor.userId }).onConflictDoNothing();
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
});

/** Titel und Beschreibung ändern. Der Slug bleibt fest (Subdomain). */
export async function updateCommunity(actor: Actor, slug: string, input: unknown) {
  const community = await manageContext(actor, slug);
  const data = updateInput.parse(input);
  const [c] = await db().update(t.communities).set({ ...data, updatedAt: new Date() }).where(eq(t.communities.id, community.id)).returning();
  return c;
}
