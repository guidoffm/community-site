import { ActionForm, Submit } from "@/components/form";
import { confirmEmail } from "@/app/actions/auth";
import { peekVerification } from "@/services/users";

export const metadata = { title: "Registrierung bestätigen" };
export const dynamic = "force-dynamic";

/**
 * Bestätigung per Button (POST) statt direkt beim Aufruf des Links: Mail-Scanner, die Links vorab
 * öffnen, sollen die Registrierung nicht versehentlich bestätigen.
 */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const pending = token ? await peekVerification(token) : null;

  if (!token || !pending) {
    return (
      <div className="card mx-auto max-w-lg space-y-3">
        <h1>Link ungültig oder abgelaufen</h1>
        <p>Der Bestätigungslink ist nicht (mehr) gültig – er gilt 24 Stunden und nur einmal.</p>
        <p>
          <a href="/register" className="btn">Erneut registrieren</a> <a href="/login" className="btn-secondary ml-2">Anmelden</a>
        </p>
      </div>
    );
  }

  return (
    <div className="card mx-auto max-w-lg space-y-4">
      <h1>Registrierung bestätigen</h1>
      <p>
        Hallo {pending.name}, bitte bestätige deine E-Mail-Adresse <strong>{pending.email}</strong>.
      </p>
      <ActionForm action={confirmEmail.bind(null, token)}>
        <Submit className="btn">Registrierung bestätigen</Submit>
      </ActionForm>
    </div>
  );
}
