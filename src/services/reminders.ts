// Erinnerungen an Event-Teilnehmer: 3 Tage, 1 Tag und 4 Stunden vor Beginn (Job event-reminders, alle 10 Minuten).
import { and, eq, gt, lte, sql } from "drizzle-orm";
import { db, t } from "@/db";
import { notifyEventReminder } from "./notifications";

const HOUR = 3_600_000;
/** Stufen, absteigend. Fällig ist eine Stufe, sobald der Beginn näher als `before` ist. */
export const REMINDERS = [
  { kind: "3d", before: 72 * HOUR, label: "in 3 Tagen" },
  { kind: "1d", before: 24 * HOUR, label: "morgen" },
  { kind: "4h", before: 4 * HOUR, label: "in 4 Stunden" },
] as const;

/**
 * Pro Event und Person wird je Stufe höchstens eine Mail verschickt, und zwar nur die jeweils aktuelle Stufe
 * (zwischen ihrem Zeitpunkt und dem der nächsten). Wer sich erst nach dem Zeitpunkt einer Stufe angemeldet hat,
 * bekommt diese Stufe nicht – er hat gerade die Anmeldebestätigung erhalten.
 */
export async function sendEventReminders(now = new Date()) {
  let sent = 0;
  for (let i = 0; i < REMINDERS.length; i++) {
    const r = REMINDERS[i];
    const nextBefore = REMINDERS[i + 1]?.before ?? 0;
    // Events, deren Beginn in (now + nextBefore, now + before] liegt
    const windowStart = new Date(now.getTime() + nextBefore);
    const windowEnd = new Date(now.getTime() + r.before);

    const due = await db().execute<{
      event_id: string;
      user_id: string;
      email: string;
      name: string;
    }>(sql`
      with participants as (
        select reg.event_id, reg.user_id, reg.created_at as since from event_registrations reg where reg.status = 'confirmed'
        union
        select e.id, e.organizer_id, e.created_at from events e
      )
      select p.event_id, p.user_id, u.email, u.name
      from participants p
      join events e on e.id = p.event_id
      join users u on u.id = p.user_id and u.email_verified_at is not null
      where e.starts_at > ${windowStart} and e.starts_at <= ${windowEnd}
        and p.since < e.starts_at - make_interval(secs => ${r.before / 1000})
        and not exists (select 1 from event_reminders er where er.event_id = p.event_id and er.user_id = p.user_id and er.kind = ${r.kind})
      limit 1000`);

    for (const row of due.rows) {
      await db().transaction(async (tx) => {
        const [mark] = await tx
          .insert(t.eventReminders)
          .values({ eventId: row.event_id, userId: row.user_id, kind: r.kind })
          .onConflictDoNothing()
          .returning();
        if (!mark) return;
        const [ev] = await tx
          .select({ event: t.events, communityTitle: t.communities.title, communitySlug: t.communities.slug, organizerName: t.users.name })
          .from(t.events)
          .innerJoin(t.communities, eq(t.communities.id, t.events.communityId))
          .innerJoin(t.users, eq(t.users.id, t.events.organizerId))
          .where(and(eq(t.events.id, row.event_id), gt(t.events.startsAt, now), lte(t.events.startsAt, windowEnd)));
        if (!ev) return;
        await notifyEventReminder(
          tx,
          { ...ev.event, organizerName: ev.organizerName, communityName: ev.communityTitle, communitySlug: ev.communitySlug },
          { email: row.email, name: row.name },
          r.label,
        );
        sent++;
      });
    }
  }
  return { sent };
}
