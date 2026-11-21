"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/lib/forms";

export function InviteLinkForm({ action, hasActive }: { action: (s: ActionState) => Promise<ActionState>; hasActive: boolean }) {
  const [state, run, pending] = useActionState<ActionState>(action, {});
  const [copied, setCopied] = useState(false);
  const url = state.data?.url as string | undefined;
  return (
    <div className="space-y-2">
      <form action={run}>
        <button className="btn-secondary" disabled={pending}>
          🔗 {hasActive ? "Neuen Einladungslink erzeugen" : "Einladungslink erzeugen"}
        </button>
      </form>
      {state.error && <p className="alert-error">{state.error}</p>}
      {url && (
        <div className="space-y-1 rounded-xl bg-emerald-50 p-3 text-sm">
          <p className="text-emerald-800">{state.ok}</p>
          <div className="flex gap-2">
            <input readOnly value={url} className="input font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <button
              type="button"
              className="btn"
              onClick={() => navigator.clipboard.writeText(url).then(() => setCopied(true))}
            >
              {copied ? "✓ Kopiert" : "Kopieren"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
