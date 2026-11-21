import { getActor } from "@/lib/auth/session";
import { REASONS, TARGET_LABELS, TARGET_TYPES, describeTarget, type TargetType } from "@/services/reports";
import { ReportForm } from "./report-form";

export const metadata = { title: "Inhalt melden", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ type?: string; id?: string }> }) {
  const { type, id } = await searchParams;
  const actor = await getActor();
  const valid = TARGET_TYPES.includes(type as TargetType) && id;
  const target = valid ? await describeTarget(type as TargetType, id!) : null;

  return (
    <div className="card mx-auto max-w-2xl space-y-4">
      <h1><span className="text-gradient">Inhalt melden</span></h1>
      {!target ? (
        <div className="space-y-2 text-sm text-slate-600">
          <p>
            Du kannst rechtswidrige Inhalte oder Verstöße gegen unsere <a href="/terms" className="link">Nutzungsbedingungen</a> direkt
            am jeweiligen Inhalt über den Link <strong>„Melden“</strong> melden – bei Nachrichten, Fotos, Homepages, Events und Communities.
          </p>
          <p>
            Alternativ erreichst du uns unter <a href="mailto:mail@altiros.de" className="link">mail@altiros.de</a>. Bitte nenne dabei den
            genauen Link zum Inhalt, warum er rechtswidrig ist, sowie deinen Namen und deine E-Mail-Adresse.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-xl bg-violet-50 p-3 text-sm">
            <span className="chip bg-white text-brand-dark">{TARGET_LABELS[type as TargetType]}</span>{" "}
            <strong>{target.label}</strong>
          </div>
          <ReportForm targetType={type!} targetId={id!} reasons={REASONS} loggedIn={!!actor} />
          <p className="text-xs text-slate-500">
            Wir prüfen jede Meldung durch einen Menschen und informieren dich über die Entscheidung. Missbräuchliche Meldungen können
            zur Sperrung führen.
          </p>
        </>
      )}
    </div>
  );
}
