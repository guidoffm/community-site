import { requireActor } from "@/lib/auth/session";
import { deleteAccount } from "@/app/actions/auth";
import { ActionForm, Submit } from "@/components/form";
import { Avatar } from "@/components/decor";

export const metadata = { title: "Mein Konto" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const actor = await requireActor();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1><span className="text-gradient">Mein Konto</span></h1>

      <section className="card flex items-center gap-4">
        <Avatar name={actor.name} id={actor.userId} size="h-14 w-14 text-lg" />
        <div>
          <p className="font-display text-xl font-bold">{actor.name}</p>
          <p className="text-sm text-slate-500">{actor.email}</p>
          {actor.isSiteAdmin && <span className="chip mt-1 bg-amber-100 text-amber-800">Site-Admin</span>}
        </div>
      </section>

      <section className="card space-y-4 border-rose-200">
        <div>
          <h2 className="text-rose-700">Konto löschen</h2>
          <p className="mt-1 text-sm text-slate-600">
            Dabei werden <strong>deine Daten endgültig gelöscht</strong>: Mitgliedschaften, gesendete Nachrichten, deine Homepage
            und hochgeladene Bilder. Von dir organisierte <strong>anstehende</strong> Events werden abgesagt und die angemeldeten
            Teilnehmer per E-Mail informiert. <strong>Vergangene</strong> Events bleiben für die Community erhalten – als
            Organisator steht dann „Gelöschter Benutzer“. Das lässt sich nicht rückgängig machen.
          </p>
        </div>
        <ActionForm action={deleteAccount} className="space-y-3" confirm="Konto und alle Daten jetzt endgültig löschen?">
          <label className="block">
            <span className="label">Passwort</span>
            <input name="password" type="password" required autoComplete="current-password" className="input" />
          </label>
          <label className="block">
            <span className="label">Zur Bestätigung LÖSCHEN eingeben</span>
            <input name="confirm" required pattern="LÖSCHEN" autoComplete="off" className="input" placeholder="LÖSCHEN" />
          </label>
          <Submit className="btn-danger">Konto endgültig löschen</Submit>
        </ActionForm>
      </section>
    </div>
  );
}
