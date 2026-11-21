// Konto löschen (Recht auf Löschung): entfernt alle Daten der Person.
import { and, eq, gt, inArray, ne, or } from "drizzle-orm";
import { db, t } from "@/db";
import type { Actor } from "@/lib/auth/session";
import { AppError, notFound } from "@/lib/errors";
import { verifyPassword } from "@/lib/auth/password";
import { blockedFor, recordFailure } from "@/lib/auth/rate-limit";
import { notifyAccountDeleted, notifyEventCancelled } from "./notifications";
import { deleteScheduled, scheduleImageDeletion } from "./storage-cleanup";

export async function deleteAccount(actor: Actor, password: string, ip: string) {
  const key = `delete-account:${actor.userId}`;
  const wait = await blockedFor([[key, 5]]);
  if (wait) throw new AppError("FORBIDDEN", `Zu viele Fehlversuche. Bitte in ${wait} Minuten erneut versuchen.`);
  const user = await db().query.users.findFirst({ where: eq(t.users.id, actor.userId) });
  if (!user) throw notFound("Konto");
  if (!(await verifyPassword(password, user.passwordHash))) {
    await recordFailure(key, `delete-account:ip:${ip}`);
    throw new AppError("UNAUTHORIZED", "Das Passwort ist falsch.");
  }

  const keys = await db().transaction(async (tx) => {
    // 1. Eigene, noch anstehende Events absagen und Angemeldete informieren
    const upcoming = await tx
      .select({ event: t.events, communityTitle: t.communities.title, communitySlug: t.communities.slug })
      .from(t.events)
      .innerJoin(t.communities, eq(t.communities.id, t.events.communityId))
      .where(and(eq(t.events.organizerId, user.id), gt(t.events.startsAt, new Date())));
    for (const u of upcoming) {
      const recipients = await tx
        .select({ email: t.users.email, name: t.users.name })
        .from(t.eventRegistrations)
        .innerJoin(t.users, eq(t.users.id, t.eventRegistrations.userId))
        .where(and(eq(t.eventRegistrations.eventId, u.event.id), ne(t.eventRegistrations.userId, user.id)));
      await notifyEventCancelled(
        tx,
        { ...u.event, organizerName: user.name, communityName: u.communityTitle, communitySlug: u.communitySlug },
        recipients,
      );
    }

    // 2. Alle Bilder, die mit dem Konto verschwinden: eigene Uploads, Homepage, Fotos in eigenen Events
    const ownEvents = tx.select({ id: t.events.id }).from(t.events).where(eq(t.events.organizerId, user.id));
    const imgs = await tx
      .select({ id: t.images.id })
      .from(t.images)
      .where(or(eq(t.images.uploaderId, user.id), eq(t.images.homepageUserId, user.id), inArray(t.images.eventId, ownEvents)));
    const keys = await scheduleImageDeletion(tx, imgs.map((i) => i.id));

    // 3. Abschiedsmail, dann Konto löschen (Mitgliedschaften, Nachrichten, Events, Homepage per Cascade)
    await notifyAccountDeleted(tx, { email: user.email, name: user.name });
    await tx.delete(t.users).where(eq(t.users.id, user.id));
    return keys;
  });
  await deleteScheduled(keys);
}
