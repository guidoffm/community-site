"use client";

import { useState } from "react";
import { deleteMessages } from "@/app/actions/messages";

type Row = { id: string; who: string; subject: string; community: string; date: string; unread: boolean };

/** Nachrichtenliste mit Mehrfachauswahl zum Löschen. */
export function MessageList({ rows, back }: { rows: Row[]; back: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const all = rows.length > 0 && selected.size === rows.length;
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <form action={deleteMessages} className="space-y-2">
      <input type="hidden" name="back" value={back} />
      <div className="flex flex-wrap items-center gap-3 px-1 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={all} onChange={() => setSelected(all ? new Set() : new Set(rows.map((r) => r.id)))} className="accent-[#7c3aed]" />
          Alle auswählen
        </label>
        <button
          className="btn-secondary px-3 py-1.5 disabled:opacity-40"
          disabled={selected.size === 0}
          data-confirm={`${selected.size} Nachricht${selected.size === 1 ? "" : "en"} löschen?`}
        >
          🗑️ {selected.size > 0 ? `${selected.size} löschen` : "Löschen"}
        </button>
      </div>
      <ul className="list">
        {rows.map((r) => (
          <li key={r.id} className={`flex items-center gap-3 pl-4 ${selected.has(r.id) ? "bg-violet-50" : ""}`}>
            <input type="checkbox" name="ids" value={r.id} checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="shrink-0 accent-[#7c3aed]" aria-label={`„${r.subject}“ auswählen`} />
            <a href={`/messages/${r.id}`} className={`grid min-w-0 flex-1 gap-x-4 py-3 pr-4 hover:text-brand sm:grid-cols-[12rem_1fr_auto] ${r.unread ? "font-semibold" : ""}`}>
              <span className="truncate">{r.unread && <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-pop" />}{r.who}</span>
              <span className="truncate">{r.subject} <span className="font-normal text-slate-400">· {r.community}</span></span>
              <span className="text-sm font-normal text-slate-500">{r.date}</span>
            </a>
          </li>
        ))}
      </ul>
    </form>
  );
}
