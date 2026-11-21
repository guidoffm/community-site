import { MAX_GUESTS } from "@/services/events";

export function CapacityFields({ capacity, allowGuests }: { capacity?: number | null; allowGuests?: boolean }) {
  return (
    <div className="grid gap-4 rounded-2xl border border-violet-100 bg-violet-50/40 p-3 sm:grid-cols-2">
      <label className="block">
        <span className="label">Teilnehmerlimit (optional)</span>
        <input name="capacity" type="number" min={1} max={10000} defaultValue={capacity ?? ""} placeholder="unbegrenzt" className="input" />
        <span className="mt-1 block text-xs text-slate-500">Personen inkl. Begleitung. Ist es erreicht, gibt es eine Warteliste mit automatischem Nachrücken.</span>
      </label>
      <label className="flex items-start gap-2 self-center text-sm">
        <input type="checkbox" name="allowGuests" defaultChecked={allowGuests} className="mt-1 accent-[#7c3aed]" />
        <span>
          <span className="font-semibold">Begleitpersonen erlauben</span>
          <span className="block text-xs text-slate-500">Teilnehmer können bis zu {MAX_GUESTS} Personen mitbringen.</span>
        </span>
      </label>
    </div>
  );
}
