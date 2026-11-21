import type { Metadata } from "next";
import { getActor } from "@/lib/auth/session";
import { communityUrl, siteUrl } from "@/lib/domains";
import { formatShort } from "@/lib/dates";
import { orNotFound } from "@/lib/errors";
import { communityColors } from "@/lib/colors";
import { db, t } from "@/db";
import { and, eq } from "drizzle-orm";
import { canManage, getCommunity, listMembers, memberCount, membershipOf } from "@/services/communities";
import { listEvents } from "@/services/events";
import { JoinButton } from "@/components/join-button";
import { Avatar, CommunityLogo, DateBadge } from "@/components/decor";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = await getCommunity((await params).slug).catch(() => null);
  if (!c) return {};
  const description = c.description || `Die Community ${c.title} auf 15k – Nachrichten, Events und Fotos.`;
  return {
    title: c.title,
    description,
    alternates: { canonical: communityUrl(c.slug) },
    openGraph: { title: c.title, description, url: communityUrl(c.slug) },
  };
}

export default async function CommunityPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ saved?: string; joined?: string }> }) {
  const { slug } = await params;
  const { saved, joined } = await searchParams;
  const community = await orNotFound(getCommunity(slug));
  const actor = await getActor();
  const membership = actor ? await membershipOf(actor.userId, community.id) : null;
  const isMember = !!membership;
  const mayManage = canManage(actor, membership);
  const hasRequested = !!actor && !isMember && !!(await db().query.joinRequests.findFirst({ where: and(eq(t.joinRequests.communityId, community.id), eq(t.joinRequests.userId, actor.userId)) }));
  const count = await memberCount(community.id);
  const [members, events] = isMember ? await Promise.all([listMembers(community.id), listEvents(actor!, slug)]) : [[], null];
  const here = (p: string) => communityUrl(slug, p);
  const col = communityColors(slug);

  return (
    <div className="space-y-8">
      {saved && <p className="alert-success">✓ Änderungen gespeichert.</p>}
      {joined && <p className="alert-success">🎉 Willkommen – du bist jetzt Mitglied!</p>}
      <header className="card overflow-hidden p-0">
        <div
          className={`relative h-32 bg-cover bg-center sm:h-48 ${community.coverImageId ? "" : col.gradient}`}
          style={community.coverImageId ? { backgroundImage: `url(/api/images/${community.coverImageId})` } : undefined}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(255,255,255,.4),transparent_40%),radial-gradient(circle_at_90%_90%,rgba(255,255,255,.25),transparent_35%)]" />
        </div>
        <div className="relative -mt-10 flex flex-wrap items-end gap-4 px-5 pb-5 sm:px-6">
          <CommunityLogo title={community.title} slug={slug} logoImageId={community.logoImageId} size="h-20 w-20 text-3xl" />
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl sm:text-4xl">{community.title}</h1>
            <p className="text-sm text-slate-500">
              <span className={`chip ${col.soft} ${col.text}`}>{count} Mitglied{count === 1 ? "" : "er"}</span>
              {isMember && <span className="chip ml-2 bg-emerald-100 text-emerald-800">✓ Du bist dabei</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {mayManage && <a href={here("/settings")} className="btn-secondary">✏️ Bearbeiten</a>}
            {actor ? (
              <JoinButton community={community} isMember={isMember} hasRequested={hasRequested} />
            ) : (
              <>
                <a href={siteUrl(`/register?community=${slug}&next=${encodeURIComponent(here("/"))}`)} className="btn">Registrieren & beitreten</a>
                <a href={siteUrl(`/login?next=${encodeURIComponent(here("/"))}`)} className="btn-secondary">Anmelden</a>
              </>
            )}
          </div>
        </div>
        {community.description && <p className="whitespace-pre-line border-t border-violet-50 px-5 py-4 text-slate-600 sm:px-6">{community.description}</p>}
        <p className="px-5 pb-3 text-right text-xs sm:px-6">
          <a href={siteUrl(`/report?type=community&id=${community.id}`)} className="text-slate-400 hover:text-rose-600 hover:underline">🚩 Community melden</a>
        </p>
      </header>

      {!isMember || !events ? (
        <p className="card text-center text-slate-600">
          🔒 {community.joinMode === "invite" ? "Diese Community ist nur mit Einladung zugänglich." : "Tritt der Community bei, um Mitglieder, Events und Nachrichten zu sehen."}
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <a href={here("/events/new")} className="card card-hover flex items-center gap-4">
              <span className={`flex h-12 w-12 items-center justify-center rounded-2xl text-2xl text-white shadow-md ${col.gradient}`}>📅</span>
              <span>
                <span className="block font-bold">Event organisieren</span>
                <span className="text-sm text-slate-500">Alle Mitglieder werden eingeladen</span>
              </span>
            </a>
            <a href={here("/messages/new")} className="card card-hover flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-brand text-2xl text-white shadow-md">💬</span>
              <span>
                <span className="block font-bold">Nachricht schreiben</span>
                <span className="text-sm text-slate-500">an alle oder ausgewählte Mitglieder</span>
              </span>
            </a>
          </div>

          <section className="space-y-4">
            <h2>📅 Kommende Events</h2>
            {events.upcoming.length === 0 ? (
              <p className="card text-sm text-slate-500">Keine anstehenden Events – wie wäre es mit einem Treffen?</p>
            ) : (
              <ul className="list">
                {events.upcoming.map((e) => (
                  <li key={e.id}>
                    <a href={here(`/events/${e.id}`)} className="list-row flex-nowrap">
                      <DateBadge date={e.startsAt} slug={slug} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{e.title}</span>
                        <span className="block truncate text-sm text-slate-500">{formatShort(e.startsAt)} · 📍 {e.location}</span>
                      </span>
                      <span className="chip shrink-0 bg-brand-light text-brand-dark">{e.registrations} Zusagen</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {events.past.length > 0 && (
            <section className="space-y-4">
              <h2>🕰️ Vergangene Events</h2>
              <ul className="list">
                {events.past.map((e) => (
                  <li key={e.id}>
                    <a href={here(`/events/${e.id}`)} className="list-row flex-nowrap text-slate-600">
                      <DateBadge date={e.startsAt} slug={slug} muted />
                      <span className="min-w-0 flex-1 truncate">{e.title}</span>
                      <span className="chip shrink-0 bg-slate-100 text-slate-600">📸 {e.photos} · 👥 {e.registrations}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-4">
            <h2>👥 Mitglieder</h2>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {members.map((m) => (
                <li key={m.userId} className="flex items-center gap-3 rounded-2xl border border-violet-100 bg-white px-3 py-2 text-sm shadow-sm">
                  <Avatar name={m.name} id={m.userId} />
                  <span className="min-w-0 flex-1 truncate">
                    {m.hasHomepage ? <a href={siteUrl(`/u/${m.userId}`)} className="link">{m.name}</a> : <span className="font-medium">{m.name}</span>}
                    {m.role === "admin" && <span className="chip ml-1.5 bg-amber-100 text-amber-800">Admin</span>}
                  </span>
                  {m.userId !== actor!.userId && (
                    <a href={here(`/messages/new?to=${m.userId}`)} className="rounded-full px-2 py-1 text-base transition hover:bg-brand-light" title={`Nachricht an ${m.name}`}>
                      💬
                    </a>
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
