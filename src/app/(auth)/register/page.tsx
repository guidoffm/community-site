import { redirect } from "next/navigation";
import { ActionForm, Submit } from "@/components/form";
import { register } from "@/app/actions/auth";
import { getActor } from "@/lib/auth/session";
import { listCommunities } from "@/services/communities";

export const metadata = { title: "Registrieren" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ community?: string; next?: string }> }) {
  if (await getActor()) redirect("/");
  const { community, next } = await searchParams;
  const communities = await listCommunities(null);

  return (
    <div className="card mx-auto max-w-lg">
      <h1 className="mb-4">Registrieren</h1>
      <ActionForm action={register} className="space-y-4">
        <input type="hidden" name="next" value={next ?? ""} />
        {/* Honeypot – für Menschen unsichtbar */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
        <label className="block">
          <span className="label">Name</span>
          <input name="name" required autoComplete="name" className="input" />
        </label>
        <label className="block">
          <span className="label">E-Mail</span>
          <input name="email" type="email" required autoComplete="email" className="input" />
          <span className="mt-1 block text-xs text-slate-500">An diese Adresse schicken wir Benachrichtigungen über neue Nachrichten und Events.</span>
        </label>
        <label className="block">
          <span className="label">Passwort (mind. 8 Zeichen)</span>
          <input name="password" type="password" required minLength={8} autoComplete="new-password" className="input" />
        </label>
        {communities.length > 0 && (
          <fieldset>
            <legend className="label">Communities beitreten (optional, auch später möglich)</legend>
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border border-slate-200 p-3">
              {communities.map((c) => (
                <label key={c.id} className="flex gap-2 text-sm">
                  <input type="checkbox" name="communityIds" value={c.id} defaultChecked={c.slug === community} className="mt-0.5" />
                  <span>
                    <span className="font-medium">{c.title}</span>
                    {c.description && <span className="block text-slate-500">{c.description.slice(0, 120)}</span>}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <p className="text-xs text-slate-500">Du bekommst eine E-Mail mit einem Bestätigungslink. Bestätigst du ihn nicht innerhalb von 24 Stunden, wird die Registrierung gelöscht.</p>
        <Submit className="btn w-full">Konto erstellen</Submit>
      </ActionForm>
      <p className="mt-4 text-sm text-slate-600">
        Bereits registriert? <a href="/login" className="link">Anmelden</a>
      </p>
    </div>
  );
}
