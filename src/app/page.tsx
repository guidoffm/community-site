import { getActor } from "@/lib/auth/session";
import { communityUrl, APP_NAME } from "@/lib/domains";
import { formatShort } from "@/lib/dates";
import { listCommunities } from "@/services/communities";
import { upcomingForUser } from "@/services/events";
import { unreadCount } from "@/services/messages";
import { CommunityGrid } from "@/components/community-grid";

export const dynamic = "force-dynamic";

export default async function Home() {
  const actor = await getActor();
  const all = await listCommunities(actor);

  if (!actor) {
    return (
      <div className="space-y-10">
        <section className="py-10 text-center">
          <h1 className="text-4xl">Willkommen bei {APP_NAME}</h1>
          <p className="mx-auto mt-4 max-w-xl text-slate-600">
            Tritt Communities bei, schreib anderen Mitgliedern, organisiere Events und teile Fotos davon.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <a href="/register" className="btn">Kostenlos registrieren</a>
            <a href="/login" className="btn-secondary">Anmelden</a>
          </div>
        </section>
        <section className="space-y-3">
          <h2>Communities</h2>
          <CommunityGrid communities={all} />
        </section>
      </div>
    );
  }

  const [events, unread] = await Promise.all([upcomingForUser(actor), unreadCount(actor)]);
  const mine = all.filter((c) => c.isMember);

  return (
    <div className="space-y-8">
      <h1>Hallo {actor.name}!</h1>
      {unread > 0 && (
        <a href="/messages" className="block rounded-lg bg-brand-light p-4 text-brand hover:opacity-90">
          Du hast <strong>{unread}</strong> ungelesene Nachricht{unread === 1 ? "" : "en"}. →
        </a>
      )}
      <section className="space-y-3">
        <h2>Kommende Events</h2>
        {events.length === 0 ? (
          <p className="text-sm text-slate-500">Keine anstehenden Events in deinen Communities.</p>
        ) : (
          <ul className="list">
            {events.map((e) => (
              <li key={e.id}>
                <a href={communityUrl(e.communitySlug, `/events/${e.id}`)} className="list-row">
                  <span className="w-36 text-sm text-slate-500">{formatShort(e.startsAt)}</span>
                  <span className="font-medium">{e.title}</span>
                  <span className="text-sm text-slate-500">{e.communityTitle}</span>
                  {e.registered && <span className="ml-auto rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">angemeldet</span>}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2>Meine Communities</h2>
          <a href="/communities" className="link text-sm">Alle Communities →</a>
        </div>
        {mine.length === 0 ? (
          <p className="text-sm text-slate-500">
            Du bist noch in keiner Community. <a href="/communities" className="link">Jetzt eine finden oder gründen</a>.
          </p>
        ) : (
          <CommunityGrid communities={mine} />
        )}
      </section>
    </div>
  );
}
