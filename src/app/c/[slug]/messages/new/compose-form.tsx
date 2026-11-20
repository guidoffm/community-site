"use client"

import { useState } from "react"
import { ActionForm, Submit } from "@/components/form"
import type { ActionState } from "@/lib/forms"

export function ComposeForm({
  action,
  members,
  preselected,
}: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>
  members: { id: string; name: string }[]
  preselected: string | null
}) {
  const [mode, setMode] = useState(preselected && preselected !== "all" ? "selected" : "all")
  return (
    <ActionForm action={action} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="label">Empfänger</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="mode" value="all" checked={mode === "all"} onChange={() => setMode("all")} />
          Alle Mitglieder ({members.length})
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="mode" value="selected" checked={mode === "selected"} onChange={() => setMode("selected")} />
          Ausgewählte Mitglieder
        </label>
        {mode === "selected" && (
          <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-3">
            {members.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="recipientIds" value={m.id} defaultChecked={m.id === preselected} />
                {m.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <label className="block">
        <span className="label">Betreff</span>
        <input name="subject" required maxLength={200} className="input" />
      </label>
      <label className="block">
        <span className="label">Nachricht</span>
        <textarea name="body" required rows={8} maxLength={20000} className="input" />
      </label>
      <Submit className="btn">Senden</Submit>
    </ActionForm>
  )
}
