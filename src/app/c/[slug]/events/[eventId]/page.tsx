import { requireActor } from "@/lib/auth/session";
import { communityUrl } from "@/lib/domains";
import { formatEventRange, formatShort } from "@/lib/dates";
import { orNotFound } from "@/lib/errors";
import { UUID_RE } from "@/lib/utils";
import { notFound } from "next/navigation";
import { getEvent } from "@/services/events";
import { eventPhotos } from "@/services/images";
import { cancelEvent, setRegistration } from "@/app/actions/events";
import { deleteImage } from "@/app/actions/homepage";
import { ImageGallery } from "@/components/image-gallery";
import { ImageUploadForm, UploadFeedback } from "@/components/image-upload-form";

export const dynamic = "force-dynamic";

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; eventId: string }>;
  searchParams: Promise<{ created?: string; uploaded?: string; uploadError?: string }>;
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

      <article className="card space-y-4">
        <h1>{event.title}</h1>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-slate-500">Wann</dt>
          <dd>{formatEventRange(event.startsAt, event.endsAt)}</dd>
          <dt className="text-slate-500">Wo</dt>
          <dd>
            {event.location}{" "}
            <a href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(event.location)}`} target="_blank" rel="noreferrer" className="link">(Karte)</a>
          </dd>
          <dt className="text-slate-500">Organisiert von</dt>
          <dd>{d.organizer.name}</dd>
          <dt className="text-slate-500">Zusagen</dt>
          <dd><strong>{d.registrationCount}</strong> Person{d.registrationCount === 1 ? "" : "en"}</dd>
        </dl>
        <p className="whitespace-pre-line">{event.description}</p>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
          {!d.started && !d.isOrganizer && (
            <form action={setRegistration}>
              {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              <input type="hidden" name="intent" value={d.isRegistered ? "unregister" : "register"} />
              <button className={d.isRegistered ? "btn-secondary" : "btn"}>{d.isRegistered ? "Teilnahme absagen" : "Ich nehme teil"}</button>
            </form>
          )}
          {d.isRegistered && !d.started && <span className="text-sm text-green-700">✓ Du bist angemeldet.</span>}
          <a href={`${self}/event.ics`} className="btn-secondary">In Kalender eintragen (.ics)</a>
          {d.isOrganizer && (
            <form action={cancelEvent} className="ml-auto">
              {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              <button className="btn-danger" data-confirm={d.started ? "Event inkl. aller Fotos löschen?" : "Event absagen? Alle angemeldeten Teilnehmer werden per E-Mail informiert."}>
                {d.started ? "Event löschen" : "Event absagen"}
              </button>
            </form>
          )}
        </div>
      </article>

      {d.isOrganizer && (
        <section className="card space-y-3">
          <h2>Teilnehmerliste ({d.registrationCount})</h2>
          {d.registrations.length === 0 ? (
            <p className="text-sm text-slate-500">Noch keine Anmeldungen.</p>
          ) : (
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {d.registrations.map((r) => (
                <li key={r.userId}>
                  {r.name} <span className="text-slate-400">– angemeldet am {formatShort(r.createdAt)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {d.started && (
        <section className="card space-y-4">
          <h2>Fotos vom Event</h2>
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
