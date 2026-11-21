import { LoginOptions } from "./login-options";

export const metadata = { title: "Anmelden" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="card mx-auto max-w-sm">
      <h1 className="mb-1"><span className="text-gradient">Willkommen zurück!</span></h1>
      <p className="mb-6 text-sm text-slate-500">Melde dich an, um deine Communities zu sehen.</p>
      <LoginOptions next={next ?? "/"} />
      <p className="mt-6 text-sm text-slate-600">
        Noch kein Konto? <a href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="link">Jetzt registrieren</a>
      </p>
    </div>
  );
}
