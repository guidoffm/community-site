import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { communityUrl } from "@/lib/domains";
import { formatShort } from "@/lib/dates";
import { orNotFound } from "@/lib/errors";
import { UUID_RE } from "@/lib/utils";
import { readMessage } from "@/services/messages";
import { deleteMessages, replyToMessage } from "@/app/actions/messages";
import { ActionForm, Submit } from "@/components/form";

export const dynamic = "force-dynamic";

export default async function MessagePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sent?: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { sent } = await searchParams;
  const actor = await requireActor();
  const msg = await orNotFound(readMessage(actor, id));
  const names = msg.recipients.map((r) => r.name);
  const recipientLabel = names.length > 8 ? `${names.slice(0, 8).join(", ")} und ${names.length - 8} weitere` : names.join(", ");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <a href={msg.isSender && !msg.isRecipient ? "/messages?box=sent" : "/messages"} className="link text-sm">← Nachrichten</a>
        <form action={deleteMessages}>
          <input type="hidden" name="ids" value={msg.id} />
          <input type="hidden" name="back" value={msg.isSender && !msg.isRecipient ? "/messages?box=sent" : "/messages"} />
          <button className="btn-secondary px-3 py-1.5" data-confirm="Nachricht löschen?">🗑️ Löschen</button>
        </form>
      </div>
      {sent && <p className="alert-success">Nachricht gesendet. Die Empfänger werden per E-Mail benachrichtigt.</p>}

      <article className="card space-y-4">
        <header>
          <h1>{msg.subject}</h1>
          <p className="mt-2 text-sm text-slate-500">
            Von <strong className="text-slate-700">{msg.sender.name}</strong> an {recipientLabel}
            <br />
            {formatShort(msg.createdAt)} · <a href={communityUrl(msg.community.slug)} className="link">{msg.community.title}</a>
          </p>
        </header>
        <div className="whitespace-pre-wrap break-words">{msg.body}</div>
        {msg.isRecipient && !msg.isSender && (
          <p className="text-right text-xs"><a href={`/report?type=message&id=${msg.id}`} className="text-slate-400 hover:text-rose-600 hover:underline">🚩 Melden</a></p>
        )}
        {msg.parent && (
          <blockquote className="border-l-4 border-slate-200 pl-4 text-sm text-slate-500">
            <p className="mb-1">
              Antwort auf <a href={`/messages/${msg.parent.id}`} className="link">„{msg.parent.subject}“</a> von {msg.parent.senderName}:
            </p>
            <p className="line-clamp-4 whitespace-pre-wrap">{msg.parent.body}</p>
          </blockquote>
        )}
      </article>

      {msg.isRecipient && !msg.isSender && (
        <section className="card">
          <h2 className="mb-3">Antworten</h2>
          <ActionForm action={replyToMessage.bind(null, msg.id)} className="space-y-3">
            <textarea name="body" required rows={6} maxLength={20000} className="input" placeholder={`Antwort an ${msg.sender.name}…`} />
            {msg.recipients.length > 1 && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="replyAll" /> Allen Empfängern antworten ({msg.recipients.length})
              </label>
            )}
            <Submit className="btn">Antwort senden</Submit>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
