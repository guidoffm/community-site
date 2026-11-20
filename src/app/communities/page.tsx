import { getActor } from "@/lib/auth/session";
import { communityUrl } from "@/lib/domains";
import { listCommunities } from "@/services/communities";
import { joinCommunity, leaveCommunity } from "@/app/actions/communities";

export const metadata = { title: "Communities" };
export const dynamic = "force-dynamic";

export default async function CommunitiesPage() {
  const actor = await getActor();
  const communities = await listCommunities(actor);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Communities</h1>
        {actor && <a href="/communities/new" className="btn">Neue Community gründen</a>}
      </div>
      {communities.length === 0 && <p className="text-slate-500">Noch keine Communities vorhanden.</p>}
      <ul className="space-y-3">
        {communities.map((c) => (
          <li key={c.id} className="card flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              <a href={communityUrl(c.slug)} className="font-semibold hover:text-brand">{c.title}</a>
              <span className="ml-2 text-xs text-slate-400">{communityUrl(c.slug).replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
              {c.description && <p className="mt-1 text-sm text-slate-600">{c.description}</p>}
              <p className="mt-2 text-xs text-slate-400">{c.memberCount} Mitglieder</p>
            </div>
            {actor ? (
              <form action={c.isMember ? leaveCommunity : joinCommunity}>
                <input type="hidden" name="communityId" value={c.id} />
                <button className={c.isMember ? "btn-secondary" : "btn"}>{c.isMember ? "Austreten" : "Beitreten"}</button>
              </form>
            ) : (
              <a href={`/register?community=${c.slug}`} className="btn">Registrieren & beitreten</a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
