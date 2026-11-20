import { ActionForm, Submit } from "@/components/form";
import { login } from "@/app/actions/auth";

export const metadata = { title: "Anmelden" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="card mx-auto max-w-sm">
      <h1 className="mb-1"><span className="text-gradient">Willkommen zurück!</span></h1>
      <p className="mb-5 text-sm text-slate-500">Melde dich an, um deine Communities zu sehen.</p>
      <ActionForm action={login} className="space-y-4">
        <input type="hidden" name="next" value={next ?? "/"} />
        <label className="block">
          <span className="label">E-Mail</span>
          <input name="email" type="email" required autoComplete="email" className="input" />
        </label>
        <label className="block">
          <span className="label">Passwort</span>
          <input name="password" type="password" required autoComplete="current-password" className="input" />
        </label>
        <Submit className="btn w-full">Anmelden</Submit>
      </ActionForm>
      <p className="mt-4 text-sm text-slate-600">
        Noch kein Konto? <a href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="link">Jetzt registrieren</a>
      </p>
    </div>
  );
}
