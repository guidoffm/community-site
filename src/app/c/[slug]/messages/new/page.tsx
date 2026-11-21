import { requireActor } from "@/lib/auth/session";
import { communityUrl } from "@/lib/domains";
import { orNotFound } from "@/lib/errors";
import { communityContext, listMembers } from "@/services/communities";
import { sendMessage } from "@/app/actions/messages";
import { ComposeForm } from "./compose-form";

export const metadata = { title: "Neue Nachricht" };

export default async function NewMessagePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ to?: string }> }) {
  const { slug } = await params;
  const { to } = await searchParams;
  const actor = await requireActor();
  const { community } = await orNotFound(communityContext(actor, slug));
  const members = (await listMembers(community.id)).filter((m) => m.userId !== actor.userId);

  return (
    <div className="card mx-auto max-w-2xl">
      <a href={communityUrl(slug)} className="link text-sm">← {community.title}</a>
      <h1 className="mt-2">💬 Nachricht schreiben</h1>
      <p className="mb-5 mt-1 text-sm text-slate-500">
        An alle oder ausgewählte Mitglieder von {community.title}. Die Empfänger werden zusätzlich per E-Mail benachrichtigt.
      </p>
      {members.length === 0 ? (
        <div className="rounded-2xl bg-brand-light/60 p-4 text-sm text-slate-700">
          <p className="font-semibold">Du bist bisher das einzige Mitglied.</p>
          <p className="mt-1">
            Sobald weitere Mitglieder beigetreten sind, kannst du hier allen oder ausgewählten Mitgliedern schreiben. Teile dazu
            einfach den Link <a href={communityUrl(slug)} className="link">{communityUrl(slug).replace(/^https?:\/\//, "").replace(/\/$/, "")}</a>.
          </p>
        </div>
      ) : (
        <ComposeForm action={sendMessage.bind(null, slug)} members={members.map((m) => ({ id: m.userId, name: m.name }))} preselected={to ?? null} />
      )}
    </div>
  );
}
