import { requireActor } from "@/lib/auth/session";
import { formatShort } from "@/lib/dates";
import { inbox, sent } from "@/services/messages";

export const metadata = { title: "Nachrichten" };
export const dynamic = "force-dynamic";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ box?: string }> }) {
  const actor = await requireActor();
  const isSent = (await searchParams).box === "sent";
  const rows = isSent
    ? (await sent(actor)).map((m) => ({
        id: m.id,
        who: m.recipientCount === 1 ? `An ${m.firstRecipient}` : `An ${m.recipientCount} Mitglieder`,
        subject: m.subject,
        community: m.communityName,
        date: m.createdAt,
        unread: false,
      }))
    : (await inbox(actor)).map((m) => ({ id: m.id, who: m.senderName, subject: m.subject, community: m.communityName, date: m.createdAt, unread: !m.readAt }));

  return (
    <div className="space-y-4">
      <h1>Nachrichten</h1>
      <nav className="flex gap-2 text-sm">
        <a href="/messages" className={isSent ? "btn-secondary" : "btn"}>Posteingang</a>
        <a href="/messages?box=sent" className={isSent ? "btn" : "btn-secondary"}>Gesendet</a>
      </nav>
      <p className="text-sm text-slate-500">Neue Nachrichten schreibst du auf der Seite einer Community.</p>
      {rows.length === 0 ? (
        <p className="card text-slate-500">Keine Nachrichten.</p>
      ) : (
        <ul className="list">
          {rows.map((r) => (
            <li key={r.id}>
              <a href={`/messages/${r.id}`} className={`grid gap-x-4 px-5 py-3 hover:bg-slate-50 sm:grid-cols-[12rem_1fr_auto] ${r.unread ? "font-semibold" : ""}`}>
                <span className="truncate">{r.unread && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-brand" />}{r.who}</span>
                <span className="truncate">{r.subject} <span className="font-normal text-slate-400">· {r.community}</span></span>
                <span className="text-sm font-normal text-slate-500">{formatShort(r.date)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
