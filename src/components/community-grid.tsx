import { communityUrl } from "@/lib/domains";
import { communityColors } from "@/lib/colors";
import { CommunityLogo } from "./decor";

export function CommunityGrid({
  communities,
}: {
  communities: { id: string; slug: string; title: string; description: string; memberCount: number; isMember?: boolean; logoImageId?: string | null }[];
}) {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {communities.map((c) => {
        const col = communityColors(c.slug);
        return (
          <li key={c.id}>
            <a href={communityUrl(c.slug)} className="card card-hover group block h-full overflow-hidden p-0">
              <div className={`relative h-20 ${col.gradient}`}>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.35),transparent_45%)]" />
                {c.isMember && <span className="chip absolute right-3 top-3 bg-white/90 text-slate-700">Mitglied</span>}
              </div>
              <div className="relative -mt-7 px-5 pb-5">
                <CommunityLogo title={c.title} slug={c.slug} logoImageId={c.logoImageId} />
                <h3 className="mt-2 text-lg font-bold group-hover:text-brand">{c.title}</h3>
                <p className="text-xs font-medium text-slate-400">{communityUrl(c.slug).replace(/^https?:\/\//, "").replace(/\/$/, "")}</p>
                {c.description && <p className="mt-2 line-clamp-3 text-sm text-slate-600">{c.description}</p>}
                <p className="mt-4 flex items-center justify-between text-xs">
                  <span className={`chip ${col.soft} ${col.text}`}>
                    {c.memberCount} Mitglied{c.memberCount === 1 ? "" : "er"}
                  </span>
                  <span className="font-semibold text-brand transition group-hover:translate-x-0.5">Ansehen →</span>
                </p>
              </div>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
