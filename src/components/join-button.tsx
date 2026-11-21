import { joinCommunity, leaveCommunity } from "@/app/actions/communities";

/** Beitreten / Anfragen / Austreten – je nach Beitrittsmodus und Status. */
export function JoinButton({
  community,
  isMember,
  hasRequested,
}: {
  community: { id: string; title: string; joinMode: string };
  isMember: boolean;
  hasRequested: boolean;
}) {
  if (isMember)
    return (
      <form action={leaveCommunity}>
        <input type="hidden" name="communityId" value={community.id} />
        <button className="btn-secondary" data-confirm={`„${community.title}“ wirklich verlassen?`}>Austreten</button>
      </form>
    );
  if (community.joinMode === "invite") return <span className="chip bg-slate-100 text-slate-600">🔒 Nur mit Einladung</span>;
  if (hasRequested) return <span className="chip bg-amber-100 text-amber-800">⏳ Anfrage gesendet</span>;
  return (
    <form action={joinCommunity}>
      <input type="hidden" name="communityId" value={community.id} />
      <button className="btn">{community.joinMode === "request" ? "Beitritt anfragen" : "Beitreten"}</button>
    </form>
  );
}
