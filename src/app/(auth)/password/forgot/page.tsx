import { ActionForm, Submit } from "@/components/form";
import { forgotPassword } from "@/app/actions/auth";

export const metadata = { title: "Passwort vergessen" };

export default function ForgotPasswordPage() {
  return (
    <div className="card mx-auto max-w-sm">
      <h1 className="mb-1"><span className="text-gradient">Passwort vergessen?</span></h1>
      <p className="mb-5 text-sm text-slate-500">Gib deine E-Mail-Adresse ein. Wir schicken dir einen Link, mit dem du ein neues Passwort festlegen kannst.</p>
      <ActionForm action={forgotPassword} className="space-y-4">
        <label className="block">
          <span className="label">E-Mail</span>
          <input name="email" type="email" required autoComplete="email" className="input" />
        </label>
        <Submit className="btn w-full">Link anfordern</Submit>
      </ActionForm>
      <p className="mt-4 text-sm text-slate-600"><a href="/login" className="link">← Zurück zur Anmeldung</a></p>
    </div>
  );
}
