"use client";

import { browserSupportsWebAuthn, startAuthentication } from "@simplewebauthn/browser";
import { useActionState, useEffect, useState, useTransition } from "react";
import { passkeyLoginFinish, passkeyLoginOptions } from "@/app/actions/passkeys";
import { login, loginWithCode, sendLoginCode } from "@/app/actions/auth";
import type { ActionState } from "@/lib/forms";

/** Anmeldung: 1. Passkey, 2. Einmal-Code per E-Mail, 3. Passwort */
export function LoginOptions({ next }: { next: string }) {
  const [supported, setSupported] = useState(true);
  const [pkError, setPkError] = useState<string | null>(null);
  const [pkPending, startPk] = useTransition();
  useEffect(() => setSupported(browserSupportsWebAuthn()), []);

  const passkeyLogin = () =>
    startPk(async () => {
      setPkError(null);
      const opts = await passkeyLoginOptions();
      if (!opts.ok || !opts.data) return setPkError(opts.ok ? "Unbekannter Fehler" : opts.error);
      let response;
      try {
        response = await startAuthentication({ optionsJSON: opts.data });
      } catch {
        return setPkError("Anmeldung abgebrochen oder kein Passkey für 15k auf diesem Gerät gefunden.");
      }
      const r = await passkeyLoginFinish(response, next);
      if (!r.ok) return setPkError(r.error);
      window.location.href = r.data!;
    });

  const [codeState, sendCode, sending] = useActionState<ActionState, FormData>(sendLoginCode, {});
  const [verifyState, verifyCode, verifying] = useActionState<ActionState, FormData>(loginWithCode, {});
  const [pwState, pwLogin, pwPending] = useActionState<ActionState, FormData>(login, {});
  const codeEmail = (codeState.data?.email as string | undefined) ?? null;

  return (
    <div className="space-y-6">
      {/* 1. Passkey */}
      <section className="space-y-2">
        <button type="button" onClick={passkeyLogin} disabled={!supported || pkPending} className="btn w-full py-3 text-base">
          🔐 {pkPending ? "Warte auf Passkey …" : "Mit Passkey anmelden"}
        </button>
        <p className="text-center text-xs text-slate-500">
          {supported ? "Per Fingerabdruck, Gesichtserkennung oder Geräte-PIN – ganz ohne Passwort." : "Dieser Browser unterstützt keine Passkeys."}
        </p>
        {pkError && <p className="alert-error">{pkError}</p>}
      </section>

      <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
        <span className="h-px flex-1 bg-violet-100" /> oder <span className="h-px flex-1 bg-violet-100" />
      </div>

      {/* 2. Einmal-Code per E-Mail */}
      <section className="space-y-3">
        <h2 className="text-base">✉️ Code per E-Mail</h2>
        {!codeEmail ? (
          <form action={sendCode} className="space-y-3">
            <input name="email" type="email" required autoComplete="email webauthn" placeholder="deine@email.de" className="input" />
            <button className="btn-secondary w-full" disabled={sending}>{sending ? "Wird gesendet …" : "Code zuschicken"}</button>
            {codeState.error && <p className="alert-error">{codeState.error}</p>}
          </form>
        ) : (
          <form action={verifyCode} className="space-y-3">
            <p className="alert-success">{codeState.ok}</p>
            <input type="hidden" name="email" value={codeEmail} />
            <input type="hidden" name="next" value={next} />
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{3} ?\d{3}"
              maxLength={7}
              required
              autoFocus
              placeholder="123 456"
              className="input text-center font-display text-2xl tracking-[0.4em]"
            />
            <button className="btn w-full" disabled={verifying}>{verifying ? "Prüfe …" : "Anmelden"}</button>
            {verifyState.error && <p className="alert-error">{verifyState.error}</p>}
          </form>
        )}
      </section>

      {/* 3. Passwort */}
      <details className="rounded-2xl border border-violet-100 bg-white/60 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-600">🔑 Mit Passwort anmelden</summary>
        <form action={pwLogin} className="mt-3 space-y-3">
          <input type="hidden" name="next" value={next} />
          <input name="email" type="email" required autoComplete="email" placeholder="E-Mail" className="input" />
          <input name="password" type="password" required autoComplete="current-password" placeholder="Passwort" className="input" />
          <button className="btn-secondary w-full" disabled={pwPending}>{pwPending ? "…" : "Anmelden"}</button>
          {pwState.error && <p className="alert-error">{pwState.error}</p>}
          <p className="text-right text-sm"><a href="/password/forgot" className="link">Passwort vergessen?</a></p>
        </form>
      </details>
    </div>
  );
}
