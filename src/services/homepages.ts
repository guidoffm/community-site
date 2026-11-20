import { and, asc, count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, t } from "@/db";
import type { Actor } from "@/lib/auth/session";
import { notFound } from "@/lib/errors";
import { deleteScheduled, scheduleImageDeletion } from "./storage-cleanup";

/** Darf `viewerId` die Homepage sehen? Öffentlich oder: gemeinsame Community mit dem Inhaber. */
export async function canViewHomepage(hp: { userId: string; visibility: "members" | "public" }, viewerId: string | null) {
  if (hp.visibility === "public") return true;
  if (!viewerId) return false;
  if (viewerId === hp.userId) return true;
  const [r] = await db()
    .select({ n: count() })
    .from(t.memberships)
    .where(
      and(
        eq(t.memberships.userId, viewerId),
        sql`exists(select 1 from memberships o where o.community_id = ${t.memberships.communityId} and o.user_id = ${hp.userId})`,
      ),
    );
  return r.n > 0;
}

export async function homepageImages(userId: string) {
  return db().select().from(t.images).where(eq(t.images.homepageUserId, userId)).orderBy(asc(t.images.createdAt));
}

export async function myHomepage(actor: Actor) {
  const hp = await db().query.homepages.findFirst({ where: eq(t.homepages.userId, actor.userId) });
  return hp ? { ...hp, images: await homepageImages(actor.userId) } : null;
}

export async function viewHomepage(viewer: Actor | null, userId: string) {
  const hp = await db().query.homepages.findFirst({ where: eq(t.homepages.userId, userId) });
  if (!hp || !(await canViewHomepage(hp, viewer?.userId ?? null))) throw notFound("Homepage");
  const owner = await db().query.users.findFirst({ where: eq(t.users.id, userId), columns: { name: true } });
  return { ...hp, ownerName: owner?.name ?? "", images: await homepageImages(userId), isOwner: viewer?.userId === userId };
}

const saveInput = z.object({
  title: z.string().trim().min(1, "Bitte gib einen Titel an.").max(150),
  content: z.string().trim().max(50000).nullable().transform((v) => v ?? ""),
  visibility: z.enum(["members", "public"]),
});

export async function saveHomepage(actor: Actor, input: unknown) {
  const data = saveInput.parse(input);
  await db()
    .insert(t.homepages)
    .values({ userId: actor.userId, ...data })
    .onConflictDoUpdate({ target: t.homepages.userId, set: { ...data, updatedAt: new Date() } });
}

export async function deleteHomepage(actor: Actor) {
  const keys = await db().transaction(async (tx) => {
    const imgs = await tx.select({ id: t.images.id }).from(t.images).where(eq(t.images.homepageUserId, actor.userId));
    const keys = await scheduleImageDeletion(tx, imgs.map((i) => i.id));
    await tx.delete(t.homepages).where(eq(t.homepages.userId, actor.userId));
    return keys;
  });
  await deleteScheduled(keys);
}
