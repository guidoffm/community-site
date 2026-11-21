import { and, desc, eq, inArray, isNull, ne, sql, count } from "drizzle-orm";
import { z } from "zod";
import { db, t } from "@/db";
import type { Actor } from "@/lib/auth/session";
import { AppError, forbidden, notFound } from "@/lib/errors";
import { communityContext } from "./communities";
import { notifyNewMessage } from "./notifications";

const sendInput = z.object({
  subject: z.string().trim().min(1, "Bitte gib einen Betreff an.").max(200),
  body: z.string().trim().min(1, "Die Nachricht ist leer.").max(20000),
  mode: z.enum(["all", "selected"]),
  recipientIds: z.array(z.uuid()).default([]),
});

async function createMessage(
  actor: Actor,
  community: { id: string; title: string },
  data: { subject: string; body: string; parentId?: string },
  recipientIds: string[],
) {
  if (recipientIds.length === 0) throw new AppError("VALIDATION", "Bitte wähle mindestens einen Empfänger aus.");
  return db().transaction(async (tx) => {
    const [msg] = await tx
      .insert(t.messages)
      .values({ communityId: community.id, senderId: actor.userId, subject: data.subject, body: data.body, parentId: data.parentId ?? null })
      .returning();
    await tx.insert(t.messageRecipients).values(recipientIds.map((userId) => ({ messageId: msg.id, userId })));
    const recipients = await tx.select({ email: t.users.email, name: t.users.name }).from(t.users).where(inArray(t.users.id, recipientIds));
    await notifyNewMessage(tx, { id: msg.id, subject: msg.subject, senderName: actor.name, communityName: community.title }, recipients);
    return msg;
  });
}

/** Nachricht an alle oder ausgewählte Mitglieder einer Community. */
export async function sendMessage(actor: Actor, slug: string, input: unknown) {
  const { community } = await communityContext(actor, slug);
  const data = sendInput.parse(input);
  const members = await db()
    .select({ userId: t.memberships.userId })
    .from(t.memberships)
    .where(
      and(
        eq(t.memberships.communityId, community.id),
        ne(t.memberships.userId, actor.userId),
        data.mode === "selected" ? inArray(t.memberships.userId, data.recipientIds.length ? data.recipientIds : ["00000000-0000-0000-0000-000000000000"]) : undefined,
      ),
    );
  return createMessage(actor, community, data, members.map((m) => m.userId));
}

/** Antwort an den Absender (optional an alle Empfänger) – nur an aktuelle Mitglieder. */
export async function replyToMessage(actor: Actor, messageId: string, input: { body: unknown; replyAll: boolean }) {
  const body = z.string().trim().min(1, "Die Antwort ist leer.").max(20000).parse(input.body);
  const original = await db().query.messages.findFirst({ where: eq(t.messages.id, messageId) });
  if (!original) throw notFound("Nachricht");
  const recipients = await db().select({ userId: t.messageRecipients.userId }).from(t.messageRecipients).where(eq(t.messageRecipients.messageId, messageId));
  if (!recipients.some((r) => r.userId === actor.userId)) throw notFound("Nachricht");

  const community = await db().query.communities.findFirst({ where: eq(t.communities.id, original.communityId) });
  if (!community) throw notFound("Community");
  const wanted = new Set([original.senderId]);
  if (input.replyAll) recipients.forEach((r) => wanted.add(r.userId));
  wanted.delete(actor.userId);

  const members = await db()
    .select({ userId: t.memberships.userId })
    .from(t.memberships)
    .where(and(eq(t.memberships.communityId, community.id), inArray(t.memberships.userId, [...wanted, actor.userId])));
  if (!members.some((m) => m.userId === actor.userId)) throw forbidden("Du bist kein Mitglied dieser Community mehr.");
  const ids = members.map((m) => m.userId).filter((id) => id !== actor.userId);
  if (ids.length === 0) throw new AppError("CONFLICT", "Der Absender ist kein Mitglied der Community mehr.");

  const subject = (original.subject.startsWith("Re: ") ? original.subject : `Re: ${original.subject}`).slice(0, 200);
  return createMessage(actor, community, { subject, body, parentId: original.id }, ids);
}

export async function inbox(actor: Actor) {
  return db()
    .select({
      id: t.messages.id,
      subject: t.messages.subject,
      createdAt: t.messages.createdAt,
      readAt: t.messageRecipients.readAt,
      senderName: t.users.name,
      communityName: t.communities.title,
    })
    .from(t.messageRecipients)
    .innerJoin(t.messages, eq(t.messages.id, t.messageRecipients.messageId))
    .innerJoin(t.users, eq(t.users.id, t.messages.senderId))
    .innerJoin(t.communities, eq(t.communities.id, t.messages.communityId))
    .where(and(eq(t.messageRecipients.userId, actor.userId), isNull(t.messageRecipients.deletedAt)))
    .orderBy(desc(t.messages.createdAt))
    .limit(100);
}

export async function sent(actor: Actor) {
  return db()
    .select({
      id: t.messages.id,
      subject: t.messages.subject,
      createdAt: t.messages.createdAt,
      communityName: t.communities.title,
      recipientCount: sql<number>`(select count(*)::int from message_recipients r where r.message_id = ${t.messages.id})`,
      firstRecipient: sql<string | null>`(select u.name from message_recipients r join users u on u.id = r.user_id where r.message_id = ${t.messages.id} limit 1)`,
    })
    .from(t.messages)
    .innerJoin(t.communities, eq(t.communities.id, t.messages.communityId))
    .where(and(eq(t.messages.senderId, actor.userId), isNull(t.messages.senderDeletedAt)))
    .orderBy(desc(t.messages.createdAt))
    .limit(100);
}

export async function unreadCount(actor: Actor) {
  const [r] = await db()
    .select({ n: count() })
    .from(t.messageRecipients)
    .where(and(eq(t.messageRecipients.userId, actor.userId), isNull(t.messageRecipients.readAt), isNull(t.messageRecipients.deletedAt)));
  return r.n;
}

async function canSee(actor: Actor, messageId: string, senderId: string, senderDeletedAt?: Date | null) {
  if (senderId === actor.userId && !senderDeletedAt) return true;
  const r = await db().query.messageRecipients.findFirst({
    where: and(eq(t.messageRecipients.messageId, messageId), eq(t.messageRecipients.userId, actor.userId), isNull(t.messageRecipients.deletedAt)),
  });
  return !!r;
}

/**
 * Nachrichten löschen – wie bei E-Mail löscht jede Seite ihre eigene Kopie: Empfänger aus dem Posteingang,
 * Absender aus „Gesendet“. Haben alle gelöscht, wird die Nachricht endgültig entfernt.
 */
export async function deleteMessages(actor: Actor, ids: string[]) {
  const valid = ids.filter((id) => /^[0-9a-f-]{36}$/.test(id)).slice(0, 500);
  if (!valid.length) return 0;
  const now = new Date();
  return db().transaction(async (tx) => {
    const r = await tx
      .update(t.messageRecipients)
      .set({ deletedAt: now })
      .where(and(inArray(t.messageRecipients.messageId, valid), eq(t.messageRecipients.userId, actor.userId), isNull(t.messageRecipients.deletedAt)))
      .returning({ id: t.messageRecipients.messageId });
    const s = await tx
      .update(t.messages)
      .set({ senderDeletedAt: now })
      .where(and(inArray(t.messages.id, valid), eq(t.messages.senderId, actor.userId), isNull(t.messages.senderDeletedAt)))
      .returning({ id: t.messages.id });
    // endgültig entfernen, wenn niemand mehr eine Kopie hat
    await tx.execute(sql`
      delete from messages m
      where m.id in (${sql.join(valid.map((v) => sql`${v}::uuid`), sql`, `)})
        and m.sender_deleted_at is not null
        and not exists (select 1 from message_recipients r where r.message_id = m.id and r.deleted_at is null)`);
    return new Set([...r, ...s].map((x) => x.id)).size;
  });
}

/** Nachricht lesen (markiert sie als gelesen). */
export async function readMessage(actor: Actor, messageId: string) {
  const msg = await db().query.messages.findFirst({ where: eq(t.messages.id, messageId) });
  if (!msg || !(await canSee(actor, msg.id, msg.senderId, msg.senderDeletedAt))) throw notFound("Nachricht");

  await db()
    .update(t.messageRecipients)
    .set({ readAt: new Date() })
    .where(and(eq(t.messageRecipients.messageId, msg.id), eq(t.messageRecipients.userId, actor.userId), isNull(t.messageRecipients.readAt)));

  const [sender, community, recipients] = await Promise.all([
    db().query.users.findFirst({ where: eq(t.users.id, msg.senderId), columns: { id: true, name: true } }),
    db().query.communities.findFirst({ where: eq(t.communities.id, msg.communityId), columns: { title: true, slug: true } }),
    db()
      .select({ userId: t.users.id, name: t.users.name })
      .from(t.messageRecipients)
      .innerJoin(t.users, eq(t.users.id, t.messageRecipients.userId))
      .where(eq(t.messageRecipients.messageId, msg.id)),
  ]);

  let parent: { id: string; subject: string; body: string; senderName: string } | null = null;
  if (msg.parentId) {
    const p = await db().query.messages.findFirst({ where: eq(t.messages.id, msg.parentId) });
    if (p && (await canSee(actor, p.id, p.senderId, p.senderDeletedAt))) {
      const ps = await db().query.users.findFirst({ where: eq(t.users.id, p.senderId), columns: { name: true } });
      parent = { id: p.id, subject: p.subject, body: p.body, senderName: ps?.name ?? "?" };
    }
  }

  return {
    ...msg,
    sender: sender!,
    community: community!,
    recipients,
    parent,
    isRecipient: recipients.some((r) => r.userId === actor.userId),
    isSender: msg.senderId === actor.userId,
  };
}
