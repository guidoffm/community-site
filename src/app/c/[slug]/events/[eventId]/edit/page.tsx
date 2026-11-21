import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { communityUrl } from "@/lib/domains";
import { orNotFound } from "@/lib/errors";
import { UUID_RE } from "@/lib/utils";
import { toLocalInput } from "@/lib/dates";
import { getEvent } from "@/services/events";
import { updateEvent } from "@/app/actions/events";
import { ActionForm, Submit } from "@/components/form";
import { LocationField } from "../../new/location-field";
import { CapacityFields } from "../../new/capacity-fields";

export const metadata = { title: "Event bearbeiten" };
export const dynamic = "force-dynamic";

export default async function EditEventPage({ params }: { params: Promise<{ slug: string; eventId: string }> }) {
  const { slug, eventId } = await params;
  if (!UUID_RE.test(eventId)) notFound();
  const actor = await requireActor();
  const d = await orNotFound(getEvent(actor, slug, eventId));
  if (!d.isOrganizer) notFound();
  const e = d.event;

  return (
    <div className="card mx-auto max-w-xl">
      <a href={communityUrl(slug, `/events/${e.id}`)} className="link text-sm">← {e.title}</a>
      <h1 className="mt-2">✏️ Event bearbeiten</h1>
      <p className="mb-4 mt-1 text-sm text-slate-500">
        Ändern sich Titel, Zeit oder Ort, bekommen alle Angemeldeten eine E-Mail mit dem aktualisierten Kalendereintrag.
      </p>
      <ActionForm action={updateEvent.bind(null, slug, e.id)} className="space-y-4">
        <label className="block">
          <span className="label">Titel *</span>
          <input name="title" required maxLength={150} defaultValue={e.title} className="input" />
        </label>
        <label className="block">
          <span className="label">Beschreibung *</span>
          <textarea name="description" required rows={6} maxLength={10000} defaultValue={e.description} className="input" />
        </label>
        <LocationField defaultLocation={e.location} defaultMapUrl={e.mapUrl ?? ""} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Beginn *</span>
            <input name="startsAt" type="datetime-local" required defaultValue={toLocalInput(e.startsAt)} className="input" />
          </label>
          <label className="block">
            <span className="label">Ende (optional)</span>
            <input name="endsAt" type="datetime-local" defaultValue={e.endsAt ? toLocalInput(e.endsAt) : ""} className="input" />
          </label>
        </div>
        <CapacityFields capacity={e.capacity} allowGuests={e.allowGuests} />
        {e.capacity !== null && d.registrationCount > e.capacity && (
          <p className="alert-error">Achtung: Es sind bereits {d.registrationCount} Personen zugesagt – mehr als das Limit. Bestehende Zusagen bleiben erhalten.</p>
        )}
        <Submit className="btn">Änderungen speichern</Submit>
      </ActionForm>
    </div>
  );
}
