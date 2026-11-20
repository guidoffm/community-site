import { communityUrl } from "@/lib/domains";

export function CommunityGrid({
  communities,
}: {
  communities: { id: string; slug: string; title: string; description: string; memberCount: number }[];
}) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {communities.map((c) => (
        <li key={c.id}>
          <a href={communityUrl(c.slug)} className="card block h-full hover:border-brand">
            <h3 className="font-semibold text-brand">{c.title}</h3>
            <p className="text-xs text-slate-400">{communityUrl(c.slug).replace(/^https?:\/\//, "").replace(/\/$/, "")}</p>
            {c.description && <p className="mt-2 line-clamp-3 text-sm text-slate-600">{c.description}</p>}
            <p className="mt-3 flex items-center justify-between text-xs text-slate-400">
              <span>{c.memberCount} Mitglied{c.memberCount === 1 ? "" : "er"}</span>
              <span className="font-medium text-brand">Ansehen →</span>
            </p>
          </a>
        </li>
      ))}
    </ul>
  );
}
