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
      <h1 className="mt-2">Neue Nachricht</h1>
      <p className="mb-4 mt-1 text-sm text-slate-500">Die Empfänger werden zusätzlich per E-Mail benachrichtigt.</p>
      {members.length === 0 ? (
        <p className="text-slate-500">Diese Community hat noch keine weiteren Mitglieder.</p>
      ) : (
        <ComposeForm action={sendMessage.bind(null, slug)} members={members.map((m) => ({ id: m.userId, name: m.name }))} preselected={to ?? null} />
      )}
    </div>
  );
}
