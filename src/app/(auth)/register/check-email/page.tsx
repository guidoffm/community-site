export const metadata = { title: "E-Mail bestätigen" };

export default async function CheckEmailPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <div className="card mx-auto max-w-lg space-y-3">
      <h1>Fast geschafft!</h1>
      <p>
        Wir haben eine E-Mail an <strong>{email ?? "deine Adresse"}</strong> geschickt. Bitte klicke auf den Link darin, um deine
        Registrierung zu bestätigen.
      </p>
      <p className="text-sm text-slate-600">
        Der Link ist <strong>24 Stunden</strong> gültig. Ohne Bestätigung wird die Registrierung automatisch gelöscht.
      </p>
      <p className="text-sm text-slate-500">
        Keine E-Mail bekommen? Sieh im Spam-Ordner nach oder <a href="/register" className="link">registriere dich erneut</a> – dann
        schicken wir einen neuen Link.
      </p>
    </div>
  );
}
