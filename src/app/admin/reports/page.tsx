import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { formatShort } from "@/lib/dates";
import { REASONS, TARGET_LABELS, listReports, type TargetType } from "@/services/reports";
import { decide } from "@/app/actions/reports";
import { ActionForm, Submit } from "@/components/form";

export const metadata = { title: "Meldungen", robots: { index: false } };
export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { open: "offen", removed: "entfernt", blocked: "Konto gesperrt", dismissed: "abgewiesen" };

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const actor = await requireActor();
  if (!actor.isSiteAdmin) notFound();
  const closed = (await searchParams).view === "closed";
  const reports = await listReports(actor, closed ? "closed" : "open");

  return (
    <div className="space-y-5">
      <h1><span className="text-gradient">Meldungen</span></h1>
      <nav className="flex gap-2 text-sm">
        <a href="/admin/reports" className={closed ? "btn-secondary" : "btn"}>Offen</a>
        <a href="/admin/reports?view=closed" className={closed ? "btn" : "btn-secondary"}>Entschieden</a>
      </nav>
      {reports.length === 0 && <p className="card text-slate-500">{closed ? "Noch keine entschiedenen Meldungen." : "Keine offenen Meldungen. 🎉"}</p>}
      <ul className="space-y-4">
        {reports.map((r) => (
          <li key={r.id} className="card space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="chip bg-rose-100 text-rose-800">{TARGET_LABELS[r.targetType as TargetType]}</span>
              <strong>{r.targetLabel}</strong>
              <span className="ml-auto text-xs text-slate-500">{formatShort(r.createdAt)} · {r.id.slice(0, 8)}</span>
            </div>
            <p className="text-sm"><span className="text-slate-500">Grund:</span> {REASONS[r.reason as keyof typeof REASONS] ?? r.reason}</p>
            <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm">{r.details}</p>
            <p className="text-xs text-slate-500">Gemeldet von {r.reporterName || "?"} ({r.reporterEmail || "ohne E-Mail"})</p>
            {r.target ? (
              <details className="rounded-xl border border-violet-100 p-3 text-sm">
                <summary className="cursor-pointer font-semibold">Gemeldeten Inhalt ansehen</summary>
                {r.target.imageId && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/images/${r.target.imageId}?size=thumb`} alt="" className="mt-2 h-40 w-40 rounded-lg object-cover" />
                )}
                <p className="mt-2 line-clamp-[12] whitespace-pre-wrap text-slate-700">{r.target.preview}</p>
                {r.target.url && <a href={r.target.url} target="_blank" rel="noreferrer" className="link text-xs">Im Kontext öffnen ↗</a>}
              </details>
            ) : (
              <p className="text-xs text-slate-500">Der Inhalt existiert nicht mehr.</p>
            )}
            {r.status === "open" ? (
              <ActionForm action={decide.bind(null, r.id)} className="space-y-2">
                <textarea name="note" required minLength={5} rows={2} className="input" placeholder="Begründung der Entscheidung (geht an Meldende und Betroffene)" />
                <div className="flex flex-wrap gap-2">
                  {r.target && r.targetType !== "community" && (
                    <Submit className="btn-danger" name="action" value="remove" confirm="Inhalt endgültig entfernen?">Inhalt entfernen</Submit>
                  )}
                  {r.target?.ownerId && (
                    <Submit className="btn-danger" name="action" value="block" confirm="Konto der verantwortlichen Person sperren?">Konto sperren</Submit>
                  )}
                  <Submit className="btn-secondary" name="action" value="dismiss">Abweisen</Submit>
                </div>
              </ActionForm>
            ) : (
              <p className="text-sm">
                <span className="chip bg-slate-100 text-slate-700">{STATUS[r.status]}</span>{" "}
                {r.decidedAt && formatShort(r.decidedAt)} – {r.decisionNote}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
