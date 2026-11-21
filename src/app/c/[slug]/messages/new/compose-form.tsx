"use client";

import { useMemo, useState } from "react";
import { ActionForm, Submit } from "@/components/form";
import type { ActionState } from "@/lib/forms";

const AVATAR = ["bg-violet-500", "bg-pink-500", "bg-orange-500", "bg-sky-500", "bg-emerald-500", "bg-amber-500", "bg-fuchsia-500", "bg-indigo-500"];
const avatarColor = (key: string) => {
  let h = 0;
  for (const ch of key) h = (h * 17 + ch.charCodeAt(0)) >>> 0;
  return AVATAR[h % AVATAR.length];
};
const initials = (name: string) => {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "?";
};

/** Empfängerwahl: alle Mitglieder oder ein bzw. mehrere ausgewählte. */
export function ComposeForm({
  action,
  members,
  preselected,
}: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
  members: { id: string; name: string }[];
  preselected: string | null;
}) {
  const initial = preselected && preselected !== "all" && members.some((m) => m.id === preselected) ? [preselected] : [];
  const [mode, setMode] = useState<"all" | "selected">(initial.length ? "selected" : "all");
  const [selected, setSelected] = useState<Set<string>>(new Set(initial));
  const [query, setQuery] = useState("");

  const visible = useMemo(
    () => members.filter((m) => m.name.toLowerCase().includes(query.trim().toLowerCase())),
    [members, query],
  );
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allVisibleSelected = visible.length > 0 && visible.every((m) => selected.has(m.id));

  const option = (value: "all" | "selected", title: string, hint: string) => (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3 transition ${
        mode === value ? "border-brand bg-brand-light/60" : "border-violet-100 bg-white hover:border-violet-200"
      }`}
    >
      <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="mt-1 accent-[#7c3aed]" />
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </label>
  );

  return (
    <ActionForm action={action} className="space-y-5">
      <fieldset className="space-y-3">
        <legend className="label">Empfänger</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {option("all", `👥 Alle Mitglieder (${members.length})`, "Jedes Mitglied der Community bekommt die Nachricht.")}
          {option("selected", "☑️ Ausgewählte Mitglieder", "Ein oder mehrere Mitglieder auswählen.")}
        </div>

        {mode === "selected" && (
          <div className="rounded-2xl border border-violet-100 bg-white p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Mitglied suchen …"
                className="input min-w-0 flex-1"
              />
              <button
                type="button"
                className="btn-secondary px-3 py-1.5"
                onClick={() =>
                  setSelected((s) => {
                    const n = new Set(s);
                    visible.forEach((m) => (allVisibleSelected ? n.delete(m.id) : n.add(m.id)));
                    return n;
                  })
                }
              >
                {allVisibleSelected ? "Keine" : "Alle markieren"}
              </button>
            </div>
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {visible.map((m) => (
                <li key={m.id}>
                  <label className={`flex cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 transition ${selected.has(m.id) ? "bg-brand-light" : "hover:bg-violet-50"}`}>
                    <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} className="accent-[#7c3aed]" />
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white ${avatarColor(m.id)}`}>
                      {initials(m.name)}
                    </span>
                    <span className="text-sm font-medium">{m.name}</span>
                  </label>
                </li>
              ))}
              {visible.length === 0 && <li className="px-2 py-3 text-sm text-slate-500">Kein Mitglied gefunden.</li>}
            </ul>
            {/* ausgewählte IDs auch bei gefilterter Liste mitsenden */}
            {[...selected].map((id) => (
              <input key={id} type="hidden" name="recipientIds" value={id} />
            ))}
            <p className="mt-2 text-xs font-semibold text-brand-dark">
              {selected.size === 0 ? "Noch niemand ausgewählt" : `${selected.size} Mitglied${selected.size === 1 ? "" : "er"} ausgewählt`}
            </p>
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
      <Submit className="btn">
        {mode === "all" ? `An alle ${members.length} senden` : `An ${selected.size || "…"} senden`}
      </Submit>
    </ActionForm>
  );
}
