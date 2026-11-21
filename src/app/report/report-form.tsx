"use client";

import { useActionState } from "react";
import { submitReport } from "@/app/actions/reports";
import type { ActionState } from "@/lib/forms";

export function ReportForm({
  targetType,
  targetId,
  reasons,
  loggedIn,
}: {
  targetType: string;
  targetId: string;
  reasons: Record<string, string>;
  loggedIn: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(submitReport, {});
  if (state.data?.done) return <p className="alert-success">{state.ok}</p>;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />
      <fieldset className="space-y-2">
        <legend className="label">Grund</legend>
        {Object.entries(reasons).map(([k, v], i) => (
          <label key={k} className="flex items-start gap-2 text-sm">
            <input type="radio" name="reason" value={k} required defaultChecked={i === 0} className="mt-1 accent-[#7c3aed]" />
            {v}
          </label>
        ))}
      </fieldset>
      <label className="block">
        <span className="label">Begründung *</span>
        <textarea name="details" required minLength={10} maxLength={5000} rows={5} className="input" placeholder="Warum ist der Inhalt rechtswidrig oder verstößt gegen die Nutzungsbedingungen?" />
      </label>
      {!loggedIn && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Dein Name *</span>
            <input name="reporterName" required maxLength={100} autoComplete="name" className="input" />
          </label>
          <label className="block">
            <span className="label">Deine E-Mail *</span>
            <input name="reporterEmail" type="email" required autoComplete="email" className="input" />
          </label>
        </div>
      )}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="goodFaith" required className="mt-1 accent-[#7c3aed]" />
        Ich bestätige, dass meine Angaben nach bestem Wissen richtig und vollständig sind.
      </label>
      {state.error && <p className="alert-error">{state.error}</p>}
      <button className="btn" disabled={pending}>{pending ? "Wird gesendet …" : "🚩 Meldung absenden"}</button>
    </form>
  );
}
