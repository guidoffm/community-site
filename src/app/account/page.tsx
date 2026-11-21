import { requireActor } from "@/lib/auth/session";
import { changePassword, deleteAccount } from "@/app/actions/auth";
import { ActionForm, Submit } from "@/components/form";
import { Avatar } from "@/components/decor";
import { listPasskeys } from "@/services/passkeys";
import { db, t } from "@/db";
import { eq } from "drizzle-orm";
import { hasPassword } from "@/services/users";
import { PasskeyManager } from "./passkey-manager";

export const metadata = { title: "Mein Konto" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const actor = await requireActor();
  const [pks, user] = await Promise.all([
    listPasskeys(actor.userId),
    db().query.users.findFirst({ where: eq(t.users.id, actor.userId), columns: { passwordHash: true } }),
  ]);
  const withPassword = !!user && hasPassword(user);
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

      <section className="card space-y-4">
        <div>
          <h2>🔐 Passkeys</h2>
          <p className="mt-1 text-sm text-slate-600">Die bevorzugte Anmeldung: schnell, ohne Passwort und sicher gegen Phishing.</p>
        </div>
        <PasskeyManager passkeys={pks.map((p) => ({ ...p, createdAt: p.createdAt.toISOString(), lastUsedAt: p.lastUsedAt?.toISOString() ?? null }))} />
      </section>

      <section className="card space-y-4">
        <h2>{withPassword ? "Passwort ändern" : "Passwort festlegen (optional)"}</h2>
        {!withPassword && <p className="text-sm text-slate-600">Du meldest dich bisher per Passkey oder E-Mail-Code an. Ein Passwort ist optional.</p>}
        <ActionForm action={changePassword} className="space-y-3" resetOnSuccess>
          {withPassword && (
            <label className="block">
              <span className="label">Aktuelles Passwort</span>
              <input name="current" type="password" required autoComplete="current-password" className="input" />
            </label>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">Neues Passwort (mind. 8 Zeichen)</span>
              <input name="password" type="password" required minLength={8} autoComplete="new-password" className="input" />
            </label>
            <label className="block">
              <span className="label">Neues Passwort wiederholen</span>
              <input name="password2" type="password" required minLength={8} autoComplete="new-password" className="input" />
            </label>
          </div>
          <Submit className="btn">{withPassword ? "Passwort ändern" : "Passwort festlegen"}</Submit>
        </ActionForm>
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
          {withPassword && (
            <label className="block">
              <span className="label">Passwort</span>
              <input name="password" type="password" required autoComplete="current-password" className="input" />
            </label>
          )}
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
