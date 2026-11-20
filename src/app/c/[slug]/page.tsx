import type { Metadata } from "next";
import { getActor } from "@/lib/auth/session";
import { communityUrl, siteUrl } from "@/lib/domains";
import { formatShort } from "@/lib/dates";
import { orNotFound } from "@/lib/errors";
import { getCommunity, listMembers, memberCount, membershipOf } from "@/services/communities";
import { listEvents } from "@/services/events";
import { joinCommunity, leaveCommunity } from "@/app/actions/communities";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = await getCommunity((await params).slug).catch(() => null);
  return c ? { title: c.title, description: c.description || undefined } : {};
}

export default async function CommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const community = await orNotFound(getCommunity(slug));
  const actor = await getActor();
  const isMember = !!actor && !!(await membershipOf(actor.userId, community.id));
  const count = await memberCount(community.id);
  const [members, events] = isMember ? await Promise.all([listMembers(community.id), listEvents(actor!, slug)]) : [[], null];
  const here = (p: string) => communityUrl(slug, p);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl">{community.title}</h1>
          {community.description && <p className="mt-2 whitespace-pre-line text-slate-600">{community.description}</p>}
          <p className="mt-2 text-sm text-slate-400">{count} Mitglied{count === 1 ? "" : "er"}</p>
        </div>
        {actor ? (
          <form action={isMember ? leaveCommunity : joinCommunity}>
            <input type="hidden" name="communityId" value={community.id} />
            <button className={isMember ? "btn-secondary" : "btn"} data-confirm={isMember ? `„${community.title}“ wirklich verlassen?` : undefined}>
              {isMember ? "Austreten" : "Beitreten"}
            </button>
          </form>
        ) : (
          <div className="flex gap-2">
            <a href={siteUrl(`/register?community=${slug}&next=${encodeURIComponent(here("/"))}`)} className="btn">Registrieren & beitreten</a>
            <a href={siteUrl(`/login?next=${encodeURIComponent(here("/"))}`)} className="btn-secondary">Anmelden</a>
          </div>
        )}
      </header>

      {!isMember || !events ? (
        <p className="card text-slate-600">Tritt der Community bei, um Mitglieder, Events und Nachrichten zu sehen.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <a href={here("/events/new")} className="btn">Event organisieren</a>
            <a href={here("/messages/new?to=all")} className="btn-secondary">Nachricht an alle</a>
          </div>

          <section className="space-y-3">
            <h2>Kommende Events</h2>
            {events.upcoming.length === 0 ? (
              <p className="text-sm text-slate-500">Keine anstehenden Events.</p>
            ) : (
              <ul className="list">
                {events.upcoming.map((e) => (
                  <li key={e.id}>
                    <a href={here(`/events/${e.id}`)} className="list-row">
                      <span className="w-36 text-sm text-slate-500">{formatShort(e.startsAt)}</span>
                      <span className="font-medium">{e.title}</span>
                      <span className="text-sm text-slate-500">{e.location}</span>
                      <span className="ml-auto text-xs text-slate-400">{e.registrations} Zusagen · von {e.organizerName}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {events.past.length > 0 && (
            <section className="space-y-3">
              <h2>Vergangene Events</h2>
              <ul className="list">
                {events.past.map((e) => (
                  <li key={e.id}>
                    <a href={here(`/events/${e.id}`)} className="list-row text-slate-600">
                      <span className="w-36 text-sm">{formatShort(e.startsAt)}</span>
                      <span>{e.title}</span>
                      <span className="ml-auto text-xs text-slate-400">{e.registrations} Teilnehmer · {e.photos} Fotos</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-3">
            <h2>Mitglieder</h2>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {members.map((m) => (
                <li key={m.userId} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                  <span>
                    {m.hasHomepage ? <a href={siteUrl(`/u/${m.userId}`)} className="link">{m.name}</a> : m.name}
                    {m.role === "admin" && <span className="ml-2 text-xs text-slate-400">Admin</span>}
                  </span>
                  {m.userId !== actor!.userId && (
                    <a href={here(`/messages/new?to=${m.userId}`)} className="text-xs text-brand hover:underline">Nachricht</a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
