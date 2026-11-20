import { formatInTimeZone } from "date-fns-tz";
import { de } from "date-fns/locale";
import { TIMEZONE } from "@/lib/dates";
import { avatarColor, communityColors, initials } from "@/lib/colors";

/** Farbiges Kalenderblatt für Events. */
export function DateBadge({ date, slug = "x", muted }: { date: Date; slug?: string; muted?: boolean }) {
  const c = communityColors(slug);
  return (
    <span
      className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl text-white shadow-md ${muted ? "bg-slate-300" : c.gradient}`}
    >
      <span className="text-[10px] font-bold uppercase tracking-wider opacity-90">
        {formatInTimeZone(date, TIMEZONE, "MMM", { locale: de }).replace(".", "")}
      </span>
      <span className="font-display text-xl font-extrabold leading-none">{formatInTimeZone(date, TIMEZONE, "d")}</span>
    </span>
  );
}

/** Rundes Initialen-Bild einer Person. */
export function Avatar({ name, id, size = "h-9 w-9 text-sm" }: { name: string; id: string; size?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ${size} ${avatarColor(id)}`}>
      {initials(name)}
    </span>
  );
}

/** Quadratisches Community-Logo mit Initialen auf Verlauf. */
export function CommunityLogo({ title, slug, size = "h-12 w-12 text-lg" }: { title: string; slug: string; size?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-2xl font-display font-extrabold text-white shadow-md ring-4 ring-white ${size} ${communityColors(slug).gradient}`}>
      {initials(title)}
    </span>
  );
}

/** Dekorative, unscharfe Farbflächen im Hintergrund. */
export function Blobs() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-brand/30 blur-3xl" />
      <div className="absolute -right-16 top-10 h-72 w-72 rounded-full bg-pop/30 blur-3xl" />
      <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-sun/25 blur-3xl" />
    </div>
  );
}
