import { ActionForm, Submit } from "@/components/form";
import { createEvent } from "@/app/actions/events";
import { requireActor } from "@/lib/auth/session";
import { communityUrl } from "@/lib/domains";
import { orNotFound } from "@/lib/errors";
import { communityContext } from "@/services/communities";
import { LocationField } from "./location-field";

export const metadata = { title: "Event organisieren" };

export default async function NewEventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const actor = await requireActor();
  const { community } = await orNotFound(communityContext(actor, slug));

  return (
    <div className="card mx-auto max-w-xl">
      <a href={communityUrl(slug)} className="link text-sm">← {community.title}</a>
      <h1 className="mt-2">Event organisieren</h1>
      <p className="mb-4 mt-1 text-sm text-slate-500">Alle Mitglieder von {community.title} werden per E-Mail benachrichtigt.</p>
      <ActionForm action={createEvent.bind(null, slug)} className="space-y-4">
        <label className="block">
          <span className="label">Titel *</span>
          <input name="title" required maxLength={150} className="input" />
        </label>
        <label className="block">
          <span className="label">Beschreibung *</span>
          <textarea name="description" required rows={6} maxLength={10000} className="input" />
        </label>
        <LocationField />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Beginn *</span>
            <input name="startsAt" type="datetime-local" required className="input" />
          </label>
          <label className="block">
            <span className="label">Ende (optional)</span>
            <input name="endsAt" type="datetime-local" className="input" />
          </label>
        </div>
        <Submit className="btn">Event erstellen & Mitglieder benachrichtigen</Submit>
      </ActionForm>
    </div>
  );
}
