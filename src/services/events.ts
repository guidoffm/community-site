import { and, asc, desc, eq, gte, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, t } from "@/db";
import type { Actor } from "@/lib/auth/session";
import { AppError, forbidden, notFound } from "@/lib/errors";
import { parseLocalDateTime } from "@/lib/dates";
import { buildIcs, eventUrl } from "@/lib/ics";
import { communityContext } from "./communities";
import { notifyEventCancelled, notifyNewEvent } from "./notifications";
import { deleteScheduled, scheduleImageDeletion } from "./storage-cleanup";

/** Event hat begonnen → Fotos dürfen hochgeladen werden, Anmeldung ist geschlossen. */
export const eventHasStarted = (e: { startsAt: Date }) => e.startsAt.getTime() <= Date.now();

/** Teilnehmer = angemeldete Personen + Organisator. Nur sie sehen und laden Event-Fotos hoch. */
export async function isParticipant(event: { id: string; organizerId: string }, userId: string | null) {
  if (!userId) return false;
  if (event.organizerId === userId) return true;
  const r = await db().query.eventRegistrations.findFirst({
    where: and(eq(t.eventRegistrations.eventId, event.id), eq(t.eventRegistrations.userId, userId)),
  });
  return !!r;
}

const createInput = z.object({
  title: z.string().trim().min(3, "Der Titel muss mindestens 3 Zeichen lang sein.").max(150),
  description: z.string().trim().min(1, "Bitte beschreibe das Event.").max(10000),
  location: z.string().trim().min(2, "Bitte gib einen Ort an.").max(300),
  startsAt: z.string(),
  endsAt: z.string().nullable().optional(),
});

export async function createEvent(actor: Actor, slug: string, input: unknown) {
  const { community } = await communityContext(actor, slug);
  const data = createInput.parse(input);
  const startsAt = parseLocalDateTime(data.startsAt);
  if (!startsAt) throw new AppError("VALIDATION", "Bitte gib Datum und Uhrzeit des Beginns an.");
  if (startsAt.getTime() < Date.now()) throw new AppError("VALIDATION", "Der Beginn liegt in der Vergangenheit.");
  const endsAt = data.endsAt ? parseLocalDateTime(data.endsAt) : null;
  if (data.endsAt && !endsAt) throw new AppError("VALIDATION", "Das Ende ist ungültig.");
  if (endsAt && endsAt <= startsAt) throw new AppError("VALIDATION", "Das Ende muss nach dem Beginn liegen.");

  return db().transaction(async (tx) => {
    const [event] = await tx
      .insert(t.events)
      .values({ communityId: community.id, organizerId: actor.userId, title: data.title, description: data.description, location: data.location, startsAt, endsAt })
      .returning();
    const recipients = await tx
      .select({ email: t.users.email, name: t.users.name })
      .from(t.memberships)
      .innerJoin(t.users, eq(t.users.id, t.memberships.userId))
      .where(and(eq(t.memberships.communityId, community.id), ne(t.memberships.userId, actor.userId)));
    await notifyNewEvent(
      tx,
      { ...event, organizerName: actor.name, communityName: community.title, communitySlug: community.slug },
      recipients,
    );
    return event;
  });
}

export async function listEvents(actor: Actor, slug: string) {
  const { community } = await communityContext(actor, slug);
  const now = new Date();
  const base = {
    id: t.events.id,
    title: t.events.title,
    location: t.events.location,
    startsAt: t.events.startsAt,
    organizerName: t.users.name,
    registrations: sql<number>`(select count(*)::int from event_registrations r where r.event_id = ${t.events.id})`,
    photos: sql<number>`(select count(*)::int from images i where i.event_id = ${t.events.id})`,
  };
  const [upcoming, past] = await Promise.all([
    db().select(base).from(t.events).innerJoin(t.users, eq(t.users.id, t.events.organizerId))
      .where(and(eq(t.events.communityId, community.id), gte(t.events.startsAt, now))).orderBy(asc(t.events.startsAt)),
    db().select(base).from(t.events).innerJoin(t.users, eq(t.users.id, t.events.organizerId))
      .where(and(eq(t.events.communityId, community.id), lt(t.events.startsAt, now))).orderBy(desc(t.events.startsAt)).limit(10),
  ]);
  return { upcoming, past };
}

/** Kommende Events aller Communities des Nutzers (Startseite). */
export async function upcomingForUser(actor: Actor, limit = 10) {
  return db()
    .select({
      id: t.events.id,
      title: t.events.title,
      startsAt: t.events.startsAt,
      communityTitle: t.communities.title,
      communitySlug: t.communities.slug,
      registered: sql<boolean>`exists(select 1 from event_registrations r where r.event_id = ${t.events.id} and r.user_id = ${actor.userId})`,
    })
    .from(t.events)
    .innerJoin(t.communities, eq(t.communities.id, t.events.communityId))
    .innerJoin(t.memberships, and(eq(t.memberships.communityId, t.events.communityId), eq(t.memberships.userId, actor.userId)))
    .where(gte(t.events.startsAt, new Date()))
    .orderBy(asc(t.events.startsAt))
    .limit(limit);
}

export async function getEvent(actor: Actor, slug: string, eventId: string) {
  const { community } = await communityContext(actor, slug);
  const event = await db().query.events.findFirst({ where: and(eq(t.events.id, eventId), eq(t.events.communityId, community.id)) });
  if (!event) throw notFound("Event");
  const [organizer, registrations] = await Promise.all([
    db().query.users.findFirst({ where: eq(t.users.id, event.organizerId), columns: { id: true, name: true } }),
    db()
      .select({ userId: t.users.id, name: t.users.name, createdAt: t.eventRegistrations.createdAt })
      .from(t.eventRegistrations)
      .innerJoin(t.users, eq(t.users.id, t.eventRegistrations.userId))
      .where(eq(t.eventRegistrations.eventId, event.id))
      .orderBy(asc(t.eventRegistrations.createdAt)),
  ]);
  const isOrganizer = event.organizerId === actor.userId;
  const isRegistered = registrations.some((r) => r.userId === actor.userId);
  return {
    event,
    community,
    organizer: organizer!,
    registrationCount: registrations.length,
    // Namen der Teilnehmer sieht nur der Organisator
    registrations: isOrganizer ? registrations : [],
    isOrganizer,
    isRegistered,
    isParticipant: isOrganizer || isRegistered,
    started: eventHasStarted(event),
  };
}

export async function setRegistration(actor: Actor, slug: string, eventId: string, register: boolean) {
  const { event, started } = await getEvent(actor, slug, eventId);
  if (started) throw new AppError("CONFLICT", "Das Event hat bereits begonnen.");
  if (register) {
    await db().insert(t.eventRegistrations).values({ eventId: event.id, userId: actor.userId }).onConflictDoNothing();
  } else {
    await db().delete(t.eventRegistrations).where(and(eq(t.eventRegistrations.eventId, event.id), eq(t.eventRegistrations.userId, actor.userId)));
  }
}

/** Organisator sagt ab (zukünftig: Teilnehmer werden informiert) bzw. löscht ein vergangenes Event samt Fotos. */
export async function cancelEvent(actor: Actor, slug: string, eventId: string) {
  const { event, community, isOrganizer, started } = await getEvent(actor, slug, eventId);
  if (!isOrganizer) throw forbidden("Nur der Organisator kann das Event absagen.");

  const keys = await db().transaction(async (tx) => {
    const photos = await tx.select({ id: t.images.id }).from(t.images).where(eq(t.images.eventId, event.id));
    const keys = await scheduleImageDeletion(tx, photos.map((p) => p.id));
    if (!started) {
      const recipients = await tx
        .select({ email: t.users.email, name: t.users.name })
        .from(t.eventRegistrations)
        .innerJoin(t.users, eq(t.users.id, t.eventRegistrations.userId))
        .where(and(eq(t.eventRegistrations.eventId, event.id), ne(t.eventRegistrations.userId, actor.userId)));
      await notifyEventCancelled(tx, { ...event, organizerName: actor.name, communityName: community.title, communitySlug: community.slug }, recipients);
    }
    await tx.delete(t.events).where(eq(t.events.id, event.id));
    return keys;
  });
  await deleteScheduled(keys);
}

export async function eventIcs(actor: Actor, slug: string, eventId: string) {
  const { event } = await getEvent(actor, slug, eventId);
  return { title: event.title, ics: buildIcs({ ...event, url: eventUrl(slug, event.id) }) };
}
