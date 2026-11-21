import { and, asc, count, desc, eq, gte, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, t, type Db } from "@/db";
import { DELETED_USER_ID } from "@/db/schema";
import type { Actor } from "@/lib/auth/session";
import { AppError, forbidden, notFound } from "@/lib/errors";
import { parseLocalDateTime } from "@/lib/dates";
import { buildIcs, eventUrl } from "@/lib/ics";
import { communityContext } from "./communities";
import {
  notifyEventCancelled,
  notifyEventChanged,
  notifyNewEvent,
  notifyOrganizerOfRegistration,
  notifyPromoted,
  notifyRegistration,
  notifyWaitlisted,
} from "./notifications";
import { deleteScheduled, scheduleImageDeletion } from "./storage-cleanup";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Höchstzahl Begleitpersonen je Anmeldung */
export const MAX_GUESTS = 5;

/** Event hat begonnen → Fotos dürfen hochgeladen werden, Anmeldung ist geschlossen. */
export const eventHasStarted = (e: { startsAt: Date }) => e.startsAt.getTime() <= Date.now();

/** Teilnehmer = bestätigt angemeldete Personen + Organisator (nicht die Warteliste). Nur sie sehen und laden Event-Fotos hoch. */
export async function isParticipant(event: { id: string; organizerId: string }, userId: string | null) {
  if (!userId) return false;
  if (event.organizerId === userId) return true;
  const r = await db().query.eventRegistrations.findFirst({
    where: and(eq(t.eventRegistrations.eventId, event.id), eq(t.eventRegistrations.userId, userId), eq(t.eventRegistrations.status, "confirmed")),
  });
  return !!r;
}

/** Belegte Plätze (bestätigte Personen inkl. Begleitpersonen) */
async function seatsTaken(tx: Tx | Db, eventId: string) {
  const [r] = await tx
    .select({ n: sql<number>`coalesce(sum(1 + ${t.eventRegistrations.guests}), 0)::int` })
    .from(t.eventRegistrations)
    .where(and(eq(t.eventRegistrations.eventId, eventId), eq(t.eventRegistrations.status, "confirmed")));
  return r.n;
}

const createInput = z.object({
  title: z.string().trim().min(3, "Der Titel muss mindestens 3 Zeichen lang sein.").max(150),
  description: z.string().trim().min(1, "Bitte beschreibe das Event.").max(10000),
  location: z.string().trim().min(2, "Bitte gib einen Ort an.").max(300),
  mapUrl: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => /^https?:\/\/\S+$/i.test(v), "Der Karten-Link muss mit http:// oder https:// beginnen.")
    .nullable()
    .optional(),
  startsAt: z.string(),
  endsAt: z.string().nullable().optional(),
  capacity: z.coerce.number().int().min(1, "Das Teilnehmerlimit muss mindestens 1 sein.").max(10000).nullable().optional(),
  allowGuests: z.boolean().default(false),
});

function parseTimes(data: { startsAt: string; endsAt?: string | null }) {
  const startsAt = parseLocalDateTime(data.startsAt);
  if (!startsAt) throw new AppError("VALIDATION", "Bitte gib Datum und Uhrzeit des Beginns an.");
  const endsAt = data.endsAt ? parseLocalDateTime(data.endsAt) : null;
  if (data.endsAt && !endsAt) throw new AppError("VALIDATION", "Das Ende ist ungültig.");
  if (endsAt && endsAt <= startsAt) throw new AppError("VALIDATION", "Das Ende muss nach dem Beginn liegen.");
  return { startsAt, endsAt };
}

export async function createEvent(actor: Actor, slug: string, input: unknown) {
  const { community } = await communityContext(actor, slug);
  const data = createInput.parse(input);
  const { startsAt, endsAt } = parseTimes(data);
  if (startsAt.getTime() < Date.now()) throw new AppError("VALIDATION", "Der Beginn liegt in der Vergangenheit.");

  return db().transaction(async (tx) => {
    const [event] = await tx
      .insert(t.events)
      .values({
        communityId: community.id,
        organizerId: actor.userId,
        title: data.title,
        description: data.description,
        location: data.location,
        mapUrl: data.mapUrl || null,
        startsAt,
        endsAt,
        capacity: data.capacity ?? null,
        allowGuests: data.allowGuests,
      })
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
    registrations: sql<number>`(select coalesce(sum(1 + r.guests), 0)::int from event_registrations r where r.event_id = ${t.events.id} and r.status = 'confirmed')`,
    capacity: t.events.capacity,
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
      registration: sql<string | null>`(select r.status from event_registrations r where r.event_id = ${t.events.id} and r.user_id = ${actor.userId})`,
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
      .select({ userId: t.users.id, name: t.users.name, createdAt: t.eventRegistrations.createdAt, status: t.eventRegistrations.status, guests: t.eventRegistrations.guests })
      .from(t.eventRegistrations)
      .innerJoin(t.users, eq(t.users.id, t.eventRegistrations.userId))
      .where(eq(t.eventRegistrations.eventId, event.id))
      .orderBy(asc(t.eventRegistrations.createdAt)),
  ]);
  const isOrganizer = event.organizerId === actor.userId;
  const confirmed = registrations.filter((r) => r.status === "confirmed");
  const waitlist = registrations.filter((r) => r.status === "waitlist");
  const mine = registrations.find((r) => r.userId === actor.userId) ?? null;
  const seats = confirmed.reduce((n, r) => n + 1 + r.guests, 0);
  return {
    event,
    community,
    organizer: organizer!,
    /** belegte Plätze inkl. Begleitpersonen */
    registrationCount: seats,
    waitlistCount: waitlist.length,
    freeSeats: event.capacity === null ? null : Math.max(event.capacity - seats, 0),
    // Namen sieht nur der Organisator
    registrations: isOrganizer ? confirmed : [],
    waitlist: isOrganizer ? waitlist : [],
    myRegistration: mine ? { status: mine.status, guests: mine.guests, waitlistPosition: mine.status === "waitlist" ? waitlist.findIndex((w) => w.userId === mine.userId) + 1 : null } : null,
    isOrganizer,
    isRegistered: mine?.status === "confirmed",
    isWaitlisted: mine?.status === "waitlist",
    isParticipant: isOrganizer || mine?.status === "confirmed",
    started: eventHasStarted(event),
  };
}

export async function setRegistration(actor: Actor, slug: string, eventId: string, register: boolean, guestsRaw: unknown = 0) {
  const { event, started, community, organizer } = await getEvent(actor, slug, eventId);
  if (started) throw new AppError("CONFLICT", "Das Event hat bereits begonnen.");
  if (event.organizerId === actor.userId) throw new AppError("CONFLICT", "Als Organisator bist du automatisch dabei.");
  const guests = event.allowGuests ? Math.min(Math.max(Math.trunc(Number(guestsRaw) || 0), 0), MAX_GUESTS) : 0;
  const info = { ...event, organizerName: organizer.name, communityName: community.title, communitySlug: community.slug };

  await db().transaction(async (tx) => {
    // Sperre auf das Event: gleichzeitige Anmeldungen dürfen das Limit nicht überbuchen
    await tx.execute(sql`select id from events where id = ${event.id} for update`);
    let status: string;
    if (register) {
      const free = event.capacity === null ? Infinity : event.capacity - (await seatsTaken(tx, event.id));
      status = 1 + guests <= free ? "confirmed" : "waitlist";
      const ins = await tx.insert(t.eventRegistrations).values({ eventId: event.id, userId: actor.userId, status, guests }).onConflictDoNothing().returning();
      if (!ins.length) return; // schon angemeldet – keine doppelten Mails
    } else {
      const del = await tx
        .delete(t.eventRegistrations)
        .where(and(eq(t.eventRegistrations.eventId, event.id), eq(t.eventRegistrations.userId, actor.userId)))
        .returning();
      if (!del.length) return;
      status = del[0].status;
    }

    const me = { email: actor.email, name: actor.name };
    if (register && status === "waitlist") {
      const [pos] = await tx.select({ n: count() }).from(t.eventRegistrations).where(and(eq(t.eventRegistrations.eventId, event.id), eq(t.eventRegistrations.status, "waitlist")));
      await notifyWaitlisted(tx, info, me, pos.n);
    } else {
      // Bestätigung bzw. Abmeldung (mit Absage-ICS nur, wenn ein Platz bestand)
      if (register || status === "confirmed") await notifyRegistration(tx, info, me, register);
    }
    // Abmeldung eines bestätigten Platzes → Warteliste rückt nach
    if (!register && status === "confirmed") await promoteWaitlist(tx, info);

    const [org] = await tx.select({ email: t.users.email, name: t.users.name }).from(t.users).where(eq(t.users.id, event.organizerId));
    if (org && event.organizerId !== DELETED_USER_ID) {
      const seats = await seatsTaken(tx, event.id);
      const label = register && status === "waitlist" ? `${actor.name} (Warteliste)` : guests && register ? `${actor.name} (+${guests})` : actor.name;
      await notifyOrganizerOfRegistration(tx, info, org, label, register, seats);
    }
  });
}

type EventInfo = Parameters<typeof notifyRegistration>[1];

/** Wartende in Anmeldereihenfolge nachrücken lassen, solange Plätze frei sind (Gruppen, die nicht passen, werden übersprungen). */
async function promoteWaitlist(tx: Tx, info: EventInfo & { capacity: number | null }) {
  const waiting = await tx
    .select({ userId: t.eventRegistrations.userId, guests: t.eventRegistrations.guests, email: t.users.email, name: t.users.name })
    .from(t.eventRegistrations)
    .innerJoin(t.users, eq(t.users.id, t.eventRegistrations.userId))
    .where(and(eq(t.eventRegistrations.eventId, info.id), eq(t.eventRegistrations.status, "waitlist")))
    .orderBy(asc(t.eventRegistrations.createdAt));
  let free = info.capacity === null ? Infinity : info.capacity - (await seatsTaken(tx, info.id));
  for (const w of waiting) {
    if (free <= 0) break;
    if (1 + w.guests > free) continue;
    await tx
      .update(t.eventRegistrations)
      .set({ status: "confirmed" })
      .where(and(eq(t.eventRegistrations.eventId, info.id), eq(t.eventRegistrations.userId, w.userId)));
    free -= 1 + w.guests;
    await notifyPromoted(tx, info, { email: w.email, name: w.name });
  }
}

// ---------------------------------------------------------------- Bearbeiten
export async function updateEvent(actor: Actor, slug: string, eventId: string, input: unknown) {
  const { event, community, organizer, isOrganizer } = await getEvent(actor, slug, eventId);
  if (!isOrganizer) throw forbidden("Nur der Organisator kann das Event bearbeiten.");
  const data = createInput.parse(input);
  const { startsAt, endsAt } = parseTimes(data);
  const timeChanged = startsAt.getTime() !== event.startsAt.getTime() || (endsAt?.getTime() ?? null) !== (event.endsAt?.getTime() ?? null);
  if (startsAt.getTime() !== event.startsAt.getTime() && startsAt.getTime() < Date.now())
    throw new AppError("VALIDATION", "Der neue Beginn liegt in der Vergangenheit.");

  const changes: string[] = [];
  if (data.title !== event.title) changes.push(`Titel: ${data.title}`);
  if (timeChanged) changes.push("Zeit");
  if (data.location !== event.location || (data.mapUrl || null) !== event.mapUrl) changes.push(`Ort: ${data.location}`);
  if (data.description !== event.description) changes.push("Beschreibung");

  return db().transaction(async (tx) => {
    await tx.execute(sql`select id from events where id = ${event.id} for update`);
    const [updated] = await tx
      .update(t.events)
      .set({
        title: data.title,
        description: data.description,
        location: data.location,
        mapUrl: data.mapUrl || null,
        startsAt,
        endsAt,
        capacity: data.capacity ?? null,
        allowGuests: data.allowGuests,
        updatedAt: new Date(),
      })
      .where(eq(t.events.id, event.id))
      .returning();
    // neue Zeit → Erinnerungen neu planen
    if (timeChanged) await tx.delete(t.eventReminders).where(eq(t.eventReminders.eventId, event.id));
    const info = { ...updated, organizerName: organizer.name, communityName: community.title, communitySlug: community.slug };
    // Wichtige Änderungen an alle Angemeldeten (inkl. Warteliste), Bestätigte mit aktualisierter Kalenderdatei
    const important = changes.filter((c) => c !== "Beschreibung");
    if (important.length && !eventHasStarted(updated)) {
      const regs = await tx
        .select({ email: t.users.email, name: t.users.name, status: t.eventRegistrations.status })
        .from(t.eventRegistrations)
        .innerJoin(t.users, eq(t.users.id, t.eventRegistrations.userId))
        .where(eq(t.eventRegistrations.eventId, event.id));
      await notifyEventChanged(tx, info, regs, important);
    }
    // mehr Plätze → Warteliste rückt nach
    await promoteWaitlist(tx, info);
    return { event: updated, notified: important.length > 0 };
  });
}

/** Organisator sagt ab (zukünftig: Teilnehmer werden informiert) bzw. löscht ein vergangenes Event samt Fotos. */
export async function cancelEvent(actor: Actor, slug: string, eventId: string) {
  const { event, isOrganizer } = await getEvent(actor, slug, eventId);
  if (!isOrganizer) throw forbidden("Nur der Organisator kann das Event absagen.");
  await removeEvent(event.id, actor.name);
}

/**
 * Event samt Fotos entfernen (ohne Rechteprüfung – Aufrufer prüft). Bei anstehenden Events werden die
 * Angemeldeten über die Absage informiert.
 */
export async function removeEvent(eventId: string, cancelledByName: string) {
  const event = await db().query.events.findFirst({ where: eq(t.events.id, eventId) });
  if (!event) throw notFound("Event");
  const community = await db().query.communities.findFirst({ where: eq(t.communities.id, event.communityId) });
  const started = eventHasStarted(event);
  const keys = await db().transaction(async (tx) => {
    const photos = await tx.select({ id: t.images.id }).from(t.images).where(eq(t.images.eventId, event.id));
    const keys = await scheduleImageDeletion(tx, photos.map((p) => p.id));
    if (!started && community) {
      const recipients = await tx
        .select({ email: t.users.email, name: t.users.name })
        .from(t.eventRegistrations)
        .innerJoin(t.users, eq(t.users.id, t.eventRegistrations.userId))
        .where(and(eq(t.eventRegistrations.eventId, event.id), ne(t.eventRegistrations.userId, event.organizerId)));
      await notifyEventCancelled(tx, { ...event, organizerName: cancelledByName, communityName: community.title, communitySlug: community.slug }, recipients);
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
