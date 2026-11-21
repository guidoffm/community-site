import { requireActor } from "@/lib/auth/session";
import { communityUrl, siteUrl } from "@/lib/domains";
import { formatEventRange, formatShort } from "@/lib/dates";
import { orNotFound } from "@/lib/errors";
import { UUID_RE } from "@/lib/utils";
import { notFound } from "next/navigation";
import { getEvent, MAX_GUESTS } from "@/services/events";
import { eventPhotos } from "@/services/images";
import { cancelEvent, setRegistration } from "@/app/actions/events";
import { deleteImage } from "@/app/actions/homepage";
import { ImageGallery } from "@/components/image-gallery";
import { Avatar, DateBadge } from "@/components/decor";
import { communityColors } from "@/lib/colors";
import { eventMapUrl } from "@/lib/maps";
import { ImageUploadForm, UploadFeedback } from "@/components/image-upload-form";

export const dynamic = "force-dynamic";

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; eventId: string }>;
  searchParams: Promise<{ created?: string; updated?: string; uploaded?: string; uploadError?: string }>;
}) {
  const { slug, eventId } = await params;
  if (!UUID_RE.test(eventId)) notFound();
  const sp = await searchParams;
  const actor = await requireActor();
  const d = await orNotFound(getEvent(actor, slug, eventId));
  const { event, community } = d;
  const self = communityUrl(slug, `/events/${eventId}`);
  const photos = d.started && d.isParticipant ? await eventPhotos(event.id) : [];
  const hidden = { slug, eventId: event.id };

  return (
    <div className="space-y-6">
      <a href={communityUrl(slug)} className="link text-sm">← {community.title}</a>
      {sp.created && <p className="alert-success">Event erstellt – die Mitglieder werden per E-Mail benachrichtigt.</p>}
      {sp.updated && (
        <p className="alert-success">
          Änderungen gespeichert{sp.updated === "notified" ? " – alle Angemeldeten bekommen eine E-Mail mit dem aktualisierten Kalendereintrag." : "."}
        </p>
      )}

      <article className="card space-y-5 overflow-hidden p-0">
        <div className={`flex items-center gap-4 p-5 text-white sm:p-6 ${communityColors(slug).gradient}`}>
          <span className="rounded-2xl bg-white/20 p-1 backdrop-blur"><DateBadge date={event.startsAt} slug={slug} /></span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/80">{d.started ? "Vergangenes Event" : "Event"} · {community.title}</p>
            <h1 className="text-2xl text-white sm:text-3xl">{event.title}</h1>
          </div>
        </div>
        <div className="space-y-4 px-5 pb-5 sm:px-6">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-slate-500">Wann</dt>
          <dd>{formatEventRange(event.startsAt, event.endsAt)}</dd>
          <dt className="text-slate-500">Wo</dt>
          <dd>
            {event.location}{" "}
            <a href={eventMapUrl(event)} target="_blank" rel="noreferrer" className="link">🗺️ Karte öffnen</a>
          </dd>
          <dt className="text-slate-500">Organisiert von</dt>
          <dd>{d.organizer.name}</dd>
          <dt className="text-slate-500">Zusagen</dt>
          <dd>
            <strong>{d.registrationCount}</strong>
            {event.capacity !== null ? ` von ${event.capacity} Plätzen belegt` : ` Person${d.registrationCount === 1 ? "" : "en"}`}
            {d.freeSeats === 0 && <span className="chip ml-2 bg-amber-100 text-amber-800">ausgebucht</span>}
            {d.waitlistCount > 0 && <span className="ml-2 text-slate-500">· {d.waitlistCount} auf der Warteliste</span>}
            {event.allowGuests && <span className="ml-2 text-slate-500">· Begleitpersonen willkommen</span>}
          </dd>
        </dl>
        <p className="whitespace-pre-line">{event.description}</p>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
          {!d.started && !d.isOrganizer && !d.myRegistration && (
            <form action={setRegistration} className="flex flex-wrap items-center gap-2">
              {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              <input type="hidden" name="intent" value="register" />
              {event.allowGuests && (
                <select name="guests" defaultValue="0" className="input w-auto" aria-label="Begleitpersonen">
                  {Array.from({ length: MAX_GUESTS + 1 }, (_, i) => (
                    <option key={i} value={i}>{i === 0 ? "ohne Begleitung" : `+ ${i} Begleitperson${i === 1 ? "" : "en"}`}</option>
                  ))}
                </select>
              )}
              <button className="btn">{d.freeSeats === 0 ? "⏳ Auf die Warteliste" : "🙋 Ich nehme teil"}</button>
            </form>
          )}
          {!d.started && d.myRegistration && (
            <form action={setRegistration}>
              {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              <input type="hidden" name="intent" value="unregister" />
              <button className="btn-secondary" data-confirm={d.isWaitlisted ? "Von der Warteliste abmelden?" : "Teilnahme absagen?"}>
                {d.isWaitlisted ? "Von der Warteliste abmelden" : "Teilnahme absagen"}
              </button>
            </form>
          )}
          {d.isRegistered && !d.started && (
            <span className="chip bg-emerald-100 text-emerald-800">
              ✓ Du bist angemeldet{d.myRegistration!.guests > 0 && ` (+${d.myRegistration!.guests})`}
            </span>
          )}
          {d.isWaitlisted && <span className="chip bg-amber-100 text-amber-800">⏳ Warteliste, Platz {d.myRegistration!.waitlistPosition}</span>}
          <a href={`${self}/event.ics`} className="btn-secondary">🗓️ In Kalender eintragen</a>
          {!d.isOrganizer && <a href={siteUrl(`/report?type=event&id=${event.id}`)} className="text-xs text-slate-400 hover:text-rose-600 hover:underline">🚩 Melden</a>}
          {d.isOrganizer && <a href={communityUrl(slug, `/events/${event.id}/edit`)} className="btn-secondary ml-auto">✏️ Bearbeiten</a>}
          {d.isOrganizer && (
            <form action={cancelEvent}>
              {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              <button className="btn-danger" data-confirm={d.started ? "Event inkl. aller Fotos löschen?" : "Event absagen? Alle angemeldeten Teilnehmer werden per E-Mail informiert."}>
                {d.started ? "Event löschen" : "Event absagen"}
              </button>
            </form>
          )}
        </div>
        </div>
      </article>

      {d.isOrganizer && (
        <section className="card space-y-3">
          <h2>👥 Teilnehmerliste ({d.registrationCount}{event.capacity !== null ? ` / ${event.capacity}` : ""} Personen)</h2>
          {d.registrations.length === 0 ? (
            <p className="text-sm text-slate-500">Noch keine Anmeldungen.</p>
          ) : (
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {d.registrations.map((r) => (
                <li key={r.userId} className="pl-1">
                  <span className="inline-flex items-center gap-2"><Avatar name={r.name} id={r.userId} size="h-6 w-6 text-[10px]" /> {r.name}</span>
                  {r.guests > 0 && <span className="chip ml-1 bg-violet-100 text-violet-800">+{r.guests}</span>}{" "}
                  <span className="text-slate-400">– angemeldet am {formatShort(r.createdAt)}</span>
                </li>
              ))}
            </ol>
          )}
          {d.waitlist.length > 0 && (
            <>
              <h3 className="pt-2 font-bold">⏳ Warteliste ({d.waitlist.length})</h3>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
                {d.waitlist.map((r) => (
                  <li key={r.userId}>
                    {r.name}
                    {r.guests > 0 && ` (+${r.guests})`} <span className="text-slate-400">– seit {formatShort(r.createdAt)}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      )}

      {d.started && (
        <section className="card space-y-4">
          <h2>📸 Fotos vom Event</h2>
          {d.isParticipant ? (
            <>
              <UploadFeedback uploaded={sp.uploaded} uploadError={sp.uploadError} />
              <ImageGallery
                images={photos.map((p) => ({
                  id: p.id,
                  caption: p.caption,
                  width: p.width,
                  height: p.height,
                  uploaderName: p.uploaderName,
                  canDelete: p.uploaderId === actor.userId || d.isOrganizer,
                }))}
                deleteAction={deleteImage}
                emptyText="Noch keine Fotos – lade die ersten hoch!"
                reportBaseUrl={siteUrl("/report")}
              />
              <ImageUploadForm target="event" eventId={event.id} returnTo={self} />
            </>
          ) : (
            <p className="text-sm text-slate-500">Fotos sind nur für Teilnehmer des Events sichtbar.</p>
          )}
        </section>
      )}
    </div>
  );
}
