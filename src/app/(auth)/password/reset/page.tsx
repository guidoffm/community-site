import { ActionForm, Submit } from "@/components/form";
import { setNewPassword } from "@/app/actions/auth";
import { peekPasswordReset } from "@/services/users";

export const metadata = { title: "Neues Passwort" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const pending = token ? await peekPasswordReset(token) : null;

  if (!token || !pending) {
    return (
      <div className="card mx-auto max-w-sm space-y-3">
        <h1>Link ungültig oder abgelaufen</h1>
        <p className="text-sm text-slate-600">Der Link gilt eine Stunde und nur einmal.</p>
        <a href="/password/forgot" className="btn">Neuen Link anfordern</a>
      </div>
    );
  }

  return (
    <div className="card mx-auto max-w-sm">
      <h1 className="mb-1"><span className="text-gradient">Neues Passwort</span></h1>
      <p className="mb-5 text-sm text-slate-500">für {pending.email}</p>
      <ActionForm action={setNewPassword.bind(null, token)} className="space-y-4">
        <input type="email" name="username" value={pending.email} autoComplete="username" readOnly hidden />
        <label className="block">
          <span className="label">Neues Passwort (mind. 8 Zeichen)</span>
          <input name="password" type="password" required minLength={8} autoComplete="new-password" className="input" />
        </label>
        <label className="block">
          <span className="label">Passwort wiederholen</span>
          <input name="password2" type="password" required minLength={8} autoComplete="new-password" className="input" />
        </label>
        <Submit className="btn w-full">Passwort speichern</Submit>
      </ActionForm>
    </div>
  );
}
