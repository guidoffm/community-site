import { requireActor } from "@/lib/auth/session";
import { formatShort } from "@/lib/dates";
import { inbox, sent } from "@/services/messages";
import { MessageList } from "./message-list";

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
      <h1><span className="text-gradient">Nachrichten</span></h1>
      <nav className="flex gap-2 text-sm">
        <a href="/messages" className={isSent ? "btn-secondary" : "btn"}>Posteingang</a>
        <a href="/messages?box=sent" className={isSent ? "btn" : "btn-secondary"}>Gesendet</a>
      </nav>
      <p className="text-sm text-slate-500">Neue Nachrichten schreibst du auf der Seite einer Community.</p>
      {rows.length === 0 ? (
        <p className="card text-slate-500">Keine Nachrichten.</p>
      ) : (
        <MessageList rows={rows.map((r) => ({ ...r, date: formatShort(r.date) }))} back={isSent ? "/messages?box=sent" : "/messages"} />
      )}
    </div>
  );
}
