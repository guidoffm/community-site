import { redirect } from "next/navigation";
import { ActionForm, Submit } from "@/components/form";
import { register } from "@/app/actions/auth";
import { getActor } from "@/lib/auth/session";
import { listCommunities } from "@/services/communities";
import { PRIVACY_URL } from "@/lib/domains";
import { MIN_AGE } from "@/lib/terms";

export const metadata = { title: "Registrieren", alternates: { canonical: "/register" } };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ community?: string; next?: string }> }) {
  if (await getActor()) redirect("/");
  const { community, next } = await searchParams;
  const communities = (await listCommunities(null)).filter((c) => c.joinMode !== "invite");

  return (
    <div className="card mx-auto max-w-lg">
      <h1 className="mb-1"><span className="text-gradient">Mach mit!</span></h1>
      <p className="mb-5 text-sm text-slate-500">Konto anlegen, Communities wählen, loslegen.</p>
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
          <span className="label">Passwort (optional, mind. 8 Zeichen)</span>
          <input name="password" type="password" minLength={8} autoComplete="new-password" className="input" />
          <span className="mt-1 block text-xs text-slate-500">
            Ohne Passwort meldest du dich per Passkey oder mit einem Code per E-Mail an – den Passkey richtest du nach der Bestätigung ein.
          </span>
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
                    {c.joinMode === "request" && <span className="ml-1 text-xs text-amber-700">(Beitritt auf Anfrage)</span>}
                    {c.description && <span className="block text-slate-500">{c.description.slice(0, 120)}</span>}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <p className="text-xs text-slate-500">Du bekommst eine E-Mail mit einem Bestätigungslink. Bestätigst du ihn nicht innerhalb von 24 Stunden, wird die Registrierung gelöscht.</p>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="acceptTerms" required className="mt-1 accent-[#7c3aed]" />
          <span>
            Ich stimme den <a href="/terms" target="_blank" rel="noreferrer" className="link">Nutzungsbedingungen</a> zu.
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="ageConfirmed" required className="mt-1 accent-[#7c3aed]" />
          <span>Ich bin mindestens {MIN_AGE} Jahre alt.</span>
        </label>
        <p className="text-xs text-slate-500">
          Welche Daten wir verarbeiten und welche Rechte du hast, steht in der{" "}
          <a href={PRIVACY_URL} target="_blank" rel="noreferrer" className="link">Datenschutzerklärung</a>.
        </p>
        <Submit className="btn w-full">Konto erstellen</Submit>
      </ActionForm>
      <p className="mt-4 text-sm text-slate-600">
        Bereits registriert? <a href="/login" className="link">Anmelden</a>
      </p>
    </div>
  );
}
