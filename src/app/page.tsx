import { getActor } from "@/lib/auth/session";
import { communityUrl, APP_NAME } from "@/lib/domains";
import { formatShort } from "@/lib/dates";
import { listCommunities } from "@/services/communities";
import { upcomingForUser } from "@/services/events";
import { unreadCount } from "@/services/messages";
import { listPasskeys } from "@/services/passkeys";
import { CommunityGrid } from "@/components/community-grid";
import { Blobs, DateBadge } from "@/components/decor";

export const dynamic = "force-dynamic";

const FEATURES = [
  { icon: "💬", title: "Nachrichten", text: "Schreib allen oder einzelnen Mitgliedern – Benachrichtigung per E-Mail inklusive." },
  { icon: "📅", title: "Events", text: "Treffen organisieren, Zusagen sammeln, Termin direkt in den Kalender übernehmen." },
  { icon: "📸", title: "Fotos", text: "Nach dem Event teilen Teilnehmer ihre Bilder – nur für die, die dabei waren." },
  { icon: "🏡", title: "Homepage", text: "Deine eigene Seite mit Text und Galerie für deine Communities." },
];

export default async function Home({ searchParams }: { searchParams: Promise<{ welcome?: string; deleted?: string; passwordReset?: string }> }) {
  const { welcome, deleted, passwordReset } = await searchParams;
  const actor = await getActor();
  const all = await listCommunities(actor);

  if (!actor) {
    return (
      <div className="space-y-14">
        {deleted && <p className="alert-success">Dein Konto und alle zugehörigen Daten wurden gelöscht. Danke, dass du dabei warst!</p>}
        <section className="relative isolate -mx-4 overflow-hidden rounded-none px-4 py-14 text-center sm:mx-0 sm:rounded-3xl">
          <Blobs />
          <span className="chip bg-white/80 text-brand-dark shadow-sm">✨ Für alle, die zusammengehören</span>
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl leading-tight sm:text-6xl">
            Deine Leute. <span className="text-gradient">Deine Community.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-slate-600">
            Bei {APP_NAME} triffst du Gleichgesinnte, schreibst dir Nachrichten, organisierst Events und teilst Fotos davon.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href="/register" className="btn px-6 py-3 text-base">Kostenlos mitmachen</a>
            <a href="/communities" className="btn-secondary px-6 py-3 text-base">Communities entdecken</a>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="card card-hover">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-light text-2xl">{f.icon}</div>
              <h3 className="mt-3 font-bold">{f.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{f.text}</p>
            </div>
          ))}
        </section>

        <section className="space-y-4">
          <h2>Communities</h2>
          <CommunityGrid communities={all} />
        </section>
      </div>
    );
  }

  const [events, unread, pks] = await Promise.all([upcomingForUser(actor), unreadCount(actor), listPasskeys(actor.userId)]);
  const mine = all.filter((c) => c.isMember);

  return (
    <div className="space-y-10">
      {pks.length === 0 && (
        <a href="/account" className="card card-hover flex items-center gap-4 border-brand/30 bg-brand-light/40">
          <span className="text-3xl">🔐</span>
          <span className="flex-1">
            <span className="block font-bold">Richte einen Passkey ein</span>
            <span className="text-sm text-slate-600">Künftig per Fingerabdruck oder Gesichtserkennung anmelden – ohne Passwort.</span>
          </span>
          <span className="font-semibold text-brand">Einrichten →</span>
        </a>
      )}
      {passwordReset && <p className="alert-success">🔑 Dein neues Passwort ist gespeichert – du bist angemeldet.</p>}
      {welcome && <p className="alert-success">🎉 Deine E-Mail-Adresse ist bestätigt – willkommen bei {APP_NAME}!</p>}
      <section className="relative isolate overflow-hidden rounded-3xl bg-gradient-brand p-6 text-white shadow-lg shadow-pop/20 sm:p-8">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_85%_15%,rgba(255,255,255,.35),transparent_40%)]" />
        <p className="text-sm font-semibold uppercase tracking-widest text-white/80">Schön, dass du da bist</p>
        <h1 className="mt-1 text-3xl text-white sm:text-4xl">Hallo {actor.name.split(" ")[0]}! 👋</h1>
        <div className="mt-5 flex flex-wrap gap-3">
          <a href="/messages" className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm font-semibold backdrop-blur transition hover:bg-white/30">
            💬 Nachrichten
            {unread > 0 && <span className="chip bg-white text-pop">{unread} neu</span>}
          </a>
          <a href="/communities" className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm font-semibold backdrop-blur transition hover:bg-white/30">
            🌍 Communities
          </a>
          <a href="/homepage" className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-2 text-sm font-semibold backdrop-blur transition hover:bg-white/30">
            🏡 Meine Homepage
          </a>
        </div>
      </section>

      <section className="space-y-4">
        <h2>📅 Kommende Events</h2>
        {events.length === 0 ? (
          <p className="card text-sm text-slate-500">Keine anstehenden Events in deinen Communities – vielleicht organisierst du das nächste?</p>
        ) : (
          <ul className="list">
            {events.map((e) => (
              <li key={e.id}>
                <a href={communityUrl(e.communitySlug, `/events/${e.id}`)} className="list-row flex-nowrap">
                  <DateBadge date={e.startsAt} slug={e.communitySlug} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{e.title}</span>
                    <span className="block text-sm text-slate-500">{formatShort(e.startsAt)} · {e.communityTitle}</span>
                  </span>
                  {e.registration === "confirmed" && <span className="chip bg-emerald-100 text-emerald-800">✓ dabei</span>}
                  {e.registration === "waitlist" && <span className="chip bg-amber-100 text-amber-800">⏳ Warteliste</span>}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2>💜 Meine Communities</h2>
          <a href="/communities" className="link text-sm">Alle Communities →</a>
        </div>
        {mine.length === 0 ? (
          <p className="card text-sm text-slate-500">
            Du bist noch in keiner Community. <a href="/communities" className="link">Jetzt eine finden</a>.
          </p>
        ) : (
          <CommunityGrid communities={mine} />
        )}
      </section>
    </div>
  );
}
