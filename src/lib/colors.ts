/** Jede Community bekommt anhand ihres Slugs eine feste, bunte Farbkombination. */
const PALETTES = [
  { from: "from-violet-500", via: "via-fuchsia-500", to: "to-pink-500", ring: "ring-violet-200", text: "text-violet-700", soft: "bg-violet-50" },
  { from: "from-orange-400", via: "via-pink-500", to: "to-rose-500", ring: "ring-orange-200", text: "text-orange-700", soft: "bg-orange-50" },
  { from: "from-sky-400", via: "via-indigo-500", to: "to-violet-500", ring: "ring-sky-200", text: "text-sky-700", soft: "bg-sky-50" },
  { from: "from-emerald-400", via: "via-teal-500", to: "to-cyan-500", ring: "ring-emerald-200", text: "text-emerald-700", soft: "bg-emerald-50" },
  { from: "from-amber-400", via: "via-orange-500", to: "to-red-500", ring: "ring-amber-200", text: "text-amber-700", soft: "bg-amber-50" },
  { from: "from-pink-500", via: "via-purple-500", to: "to-indigo-500", ring: "ring-pink-200", text: "text-pink-700", soft: "bg-pink-50" },
  { from: "from-lime-400", via: "via-emerald-500", to: "to-teal-600", ring: "ring-lime-200", text: "text-emerald-700", soft: "bg-lime-50" },
] as const;

export function communityColors(slug: string) {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const p = PALETTES[h % PALETTES.length];
  return { ...p, gradient: `bg-gradient-to-br ${p.from} ${p.via} ${p.to}` };
}

/** Hintergrundfarbe für Personen-Avatare (Initialen). */
const AVATAR = ["bg-violet-500", "bg-pink-500", "bg-orange-500", "bg-sky-500", "bg-emerald-500", "bg-amber-500", "bg-fuchsia-500", "bg-indigo-500"];
export function avatarColor(key: string) {
  let h = 0;
  for (const ch of key) h = (h * 17 + ch.charCodeAt(0)) >>> 0;
  return AVATAR[h % AVATAR.length];
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}
