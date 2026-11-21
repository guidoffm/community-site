import { getActor } from "@/lib/auth/session";
import { communityUrl } from "@/lib/domains";
import { communityColors } from "@/lib/colors";
import { listCommunities } from "@/services/communities";
import { JoinButton } from "@/components/join-button";
import { CommunityLogo } from "@/components/decor";

export const metadata = { title: "Communities", alternates: { canonical: "/communities" } };
export const dynamic = "force-dynamic";

export default async function CommunitiesPage() {
  const actor = await getActor();
  const communities = await listCommunities(actor);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl">
            <span className="text-gradient">Communities</span>
          </h1>
          <p className="mt-1 text-slate-600">Finde deine Leute und mach mit.</p>
        </div>
        {actor?.isSiteAdmin && <a href="/communities/new" className="btn">＋ Neue Community gründen</a>}
      </div>
      {communities.length === 0 && <p className="card text-slate-500">Noch keine Communities vorhanden.</p>}
      <ul className="space-y-4">
        {communities.map((c) => {
          const col = communityColors(c.slug);
          return (
            <li key={c.id} className="card card-hover relative overflow-hidden pl-6">
              <span className={`absolute inset-y-0 left-0 w-1.5 ${col.gradient}`} />
              <div className="flex flex-wrap items-start gap-4">
                <a href={communityUrl(c.slug)} aria-hidden tabIndex={-1}>
                  <CommunityLogo title={c.title} slug={c.slug} logoImageId={c.logoImageId} size="h-14 w-14 text-xl" />
                </a>
                <div className="min-w-0 flex-1">
                  <a href={communityUrl(c.slug)} className="font-display text-xl font-extrabold text-slate-900 underline-offset-4 hover:text-brand hover:underline">
                    {c.title}
                  </a>
                  <a href={communityUrl(c.slug)} className="block text-xs font-medium text-brand hover:underline">
                    {communityUrl(c.slug).replace(/^https?:\/\//, "").replace(/\/$/, "")}
                  </a>
                  {c.description && <p className="mt-2 text-sm text-slate-600">{c.description}</p>}
                  <p className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className={`chip ${col.soft} ${col.text}`}>{c.memberCount} Mitglieder</span>
                    {c.isMember && <span className="chip bg-emerald-100 text-emerald-800">✓ Mitglied</span>}
                  </p>
                </div>
                <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                  <a href={communityUrl(c.slug)} className="btn-secondary">Ansehen →</a>
                  {actor ? (
                    <JoinButton community={c} isMember={c.isMember} hasRequested={c.hasRequested} />
                  ) : (
                    c.joinMode !== "invite" && <a href={`/register?community=${c.slug}`} className="btn">Registrieren & beitreten</a>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
