"use client";

import { browserSupportsWebAuthn, startRegistration } from "@simplewebauthn/browser";
import { useEffect, useState, useTransition } from "react";
import { deletePasskey, passkeyRegisterFinish, passkeyRegisterOptions } from "@/app/actions/passkeys";

type Pk = { id: string; name: string; createdAt: string; lastUsedAt: string | null; backedUp: boolean };

export function PasskeyManager({ passkeys }: { passkeys: Pk[] }) {
  const [supported, setSupported] = useState(true);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  useEffect(() => setSupported(browserSupportsWebAuthn()), []);

  const add = () =>
    start(async () => {
      setMsg({});
      const opts = await passkeyRegisterOptions();
      if (!opts.ok || !opts.data) return setMsg({ error: opts.ok ? "Unbekannter Fehler" : opts.error });
      let response;
      try {
        response = await startRegistration({ optionsJSON: opts.data });
      } catch (e) {
        const n = (e as Error).name;
        return setMsg({ error: n === "InvalidStateError" ? "Für dieses Gerät ist bereits ein Passkey eingerichtet." : "Einrichtung abgebrochen." });
      }
      const r = await passkeyRegisterFinish(response, name);
      if (!r.ok) return setMsg({ error: r.error });
      setName("");
      setMsg({ ok: "Passkey eingerichtet – ab jetzt meldest du dich damit ohne Passwort an." });
    });

  return (
    <div className="space-y-4">
      {passkeys.length === 0 ? (
        <p className="rounded-xl bg-brand-light/60 p-3 text-sm text-slate-700">
          Noch kein Passkey eingerichtet. Mit einem Passkey meldest du dich per Fingerabdruck, Gesichtserkennung oder Geräte-PIN an –
          sicherer als ein Passwort und nicht zu phishen.
        </p>
      ) : (
        <ul className="divide-y divide-violet-50 rounded-xl border border-violet-100">
          {passkeys.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <span className="text-lg">🔐</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{p.name}</span>
                <span className="block text-xs text-slate-500">
                  eingerichtet {new Date(p.createdAt).toLocaleDateString("de-DE")}
                  {p.lastUsedAt && ` · zuletzt genutzt ${new Date(p.lastUsedAt).toLocaleDateString("de-DE")}`}
                  {p.backedUp && " · synchronisiert"}
                </span>
              </span>
              <form action={deletePasskey}>
                <input type="hidden" name="id" value={p.id} />
                <button className="text-xs font-semibold text-rose-600 hover:underline" data-confirm={`Passkey „${p.name}“ entfernen?`}>Entfernen</button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Name, z. B. iPhone" className="input min-w-0 flex-1" />
        <button type="button" onClick={add} disabled={!supported || pending} className="btn">
          {pending ? "Warte auf Gerät …" : "＋ Passkey hinzufügen"}
        </button>
      </div>
      {!supported && <p className="text-xs text-slate-500">Dieser Browser unterstützt keine Passkeys.</p>}
      {msg.ok && <p className="alert-success">{msg.ok}</p>}
      {msg.error && <p className="alert-error">{msg.error}</p>}
    </div>
  );
}
