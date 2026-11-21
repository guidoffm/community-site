import { requireActor } from "@/lib/auth/session";
import { communityUrl } from "@/lib/domains";
import { formatShort } from "@/lib/dates";
import { orNotFound } from "@/lib/errors";
import { JOIN_MODES, inviteStatus, listJoinRequests, listMembers, manageContext } from "@/services/communities";
import {
  createInviteLink,
  decideJoinRequest,
  inviteByEmail,
  removeCommunityImage,
  removeMember,
  revokeInviteLinks,
  setMemberRole,
  updateCommunity,
} from "@/app/actions/communities";
import { ActionForm, Submit } from "@/components/form";
import { Avatar, CommunityLogo } from "@/components/decor";
import { UploadFeedback } from "@/components/image-upload-form";
import { InviteLinkForm } from "./invite-link";

export const metadata = { title: "Community verwalten" };
export const dynamic = "force-dynamic";

export default async function CommunitySettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ uploaded?: string; uploadError?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const actor = await requireActor();
  const community = await orNotFound(manageContext(actor, slug));
  const [members, requests, invites] = await Promise.all([listMembers(community.id), listJoinRequests(actor, slug), inviteStatus(actor, slug)]);
  const self = communityUrl(slug, "/settings");
  const admins = members.filter((m) => m.role === "admin").length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <CommunityLogo title={community.title} slug={slug} logoImageId={community.logoImageId} />
        <div>
          <a href={communityUrl(slug)} className="link text-sm">← {community.title}</a>
          <h1>Community verwalten</h1>
        </div>
      </div>

      {/* Allgemein */}
      <section className="card space-y-4">
        <h2>⚙️ Allgemein</h2>
        <ActionForm action={updateCommunity.bind(null, slug)} className="space-y-4">
          <label className="block">
            <span className="label">Titel *</span>
            <input name="title" required minLength={3} maxLength={80} defaultValue={community.title} className="input" />
          </label>
          <label className="block">
            <span className="label">Beschreibung</span>
            <textarea name="description" rows={6} maxLength={2000} defaultValue={community.description} className="input" />
            <span className="mt-1 block text-xs text-slate-500">Die Adresse {communityUrl(slug).replace(/^https?:\/\//, "").replace(/\/$/, "")} lässt sich nicht ändern.</span>
          </label>
          <fieldset className="space-y-1">
            <legend className="label">Beitritt</legend>
            {Object.entries(JOIN_MODES).map(([k, v]) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input type="radio" name="joinMode" value={k} defaultChecked={community.joinMode === k} className="accent-[#7c3aed]" />
                {v}
              </label>
            ))}
          </fieldset>
          <Submit className="btn">Speichern</Submit>
        </ActionForm>
      </section>

      {/* Logo & Titelbild */}
      <section className="card space-y-4">
        <h2>🖼️ Logo & Titelbild</h2>
        <UploadFeedback uploaded={sp.uploaded} uploadError={sp.uploadError} />
        <div className="grid gap-4 sm:grid-cols-2">
          {(["logo", "cover"] as const).map((kind) => {
            const current = kind === "logo" ? community.logoImageId : community.coverImageId;
            return (
              <div key={kind} className="space-y-2 rounded-2xl border border-violet-100 p-3">
                <p className="font-semibold">{kind === "logo" ? "Logo (quadratisch)" : "Titelbild (Querformat)"}</p>
                {current ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/images/${current}${kind === "logo" ? "?size=thumb" : ""}`} alt="" className={`rounded-xl object-cover ${kind === "logo" ? "h-24 w-24" : "h-24 w-full"}`} />
                ) : (
                  <p className="text-xs text-slate-500">Noch keins – es werden Initialen und Farbverlauf angezeigt.</p>
                )}
                <form action="/api/images" method="post" encType="multipart/form-data" className="space-y-2">
                  <input type="hidden" name="target" value={`community-${kind}`} />
                  <input type="hidden" name="communityId" value={community.id} />
                  <input type="hidden" name="returnTo" value={self} />
                  <input name="files" type="file" accept="image/jpeg,image/png,image/webp" required className="block w-full text-xs" />
                  <button className="btn-secondary px-3 py-1.5">Hochladen</button>
                </form>
                {current && (
                  <form action={removeCommunityImage.bind(null, slug)}>
                    <input type="hidden" name="kind" value={kind} />
                    <button className="text-xs text-rose-600 hover:underline" data-confirm="Bild entfernen?">Entfernen</button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Beitrittsanfragen */}
      {(community.joinMode === "request" || requests.length > 0) && (
        <section className="card space-y-3">
          <h2>🙋 Beitrittsanfragen ({requests.length})</h2>
          {requests.length === 0 ? (
            <p className="text-sm text-slate-500">Keine offenen Anfragen.</p>
          ) : (
            <ul className="divide-y divide-violet-50">
              {requests.map((r) => (
                <li key={r.userId} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <Avatar name={r.name} id={r.userId} size="h-8 w-8 text-xs" />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{r.name}</span> <span className="text-xs text-slate-400">{formatShort(r.createdAt)}</span>
                    {r.message && <span className="block text-xs text-slate-600">„{r.message}“</span>}
                  </span>
                  <form action={decideJoinRequest.bind(null, slug)} className="flex gap-2">
                    <input type="hidden" name="userId" value={r.userId} />
                    <button name="decision" value="approve" className="btn px-3 py-1.5">Annehmen</button>
                    <button name="decision" value="decline" className="btn-secondary px-3 py-1.5" data-confirm="Anfrage ablehnen?">Ablehnen</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Einladungen */}
      <section className="card space-y-4">
        <h2>✉️ Einladungen</h2>
        <p className="text-sm text-slate-600">Eingeladene können immer beitreten – unabhängig vom Beitrittsmodus. Wer noch kein Konto hat, registriert sich und landet danach direkt in der Community.</p>
        <ActionForm action={inviteByEmail.bind(null, slug)} className="space-y-2" resetOnSuccess>
          <label className="block">
            <span className="label">Per E-Mail einladen (14 Tage gültig, einmalig)</span>
            <textarea name="emails" rows={2} required className="input" placeholder="anna@example.org, bernd@example.org" />
          </label>
          <Submit className="btn">Einladungen senden</Submit>
        </ActionForm>
        {invites.pendingEmails.length > 0 && (
          <p className="text-xs text-slate-500">Offen: {invites.pendingEmails.map((p) => p.email).join(", ")}</p>
        )}
        <div className="border-t border-violet-50 pt-3">
          <p className="mb-2 text-sm">
            <span className="font-semibold">Einladungslink zum Teilen</span> (z. B. in einer Messenger-Gruppe, 90 Tage gültig):{" "}
            {invites.activeLink ? <span className="chip bg-emerald-100 text-emerald-800">aktiv bis {formatShort(invites.activeLink.expiresAt)}</span> : <span className="text-slate-500">keiner aktiv</span>}
          </p>
          <div className="flex flex-wrap items-start gap-2">
            <InviteLinkForm action={createInviteLink.bind(null, slug)} hasActive={!!invites.activeLink} />
            {invites.activeLink && (
              <form action={revokeInviteLinks.bind(null, slug)}>
                <button className="btn-secondary" data-confirm="Einladungslink ungültig machen?">Link widerrufen</button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Mitglieder */}
      <section className="card space-y-3">
        <h2>👥 Mitglieder ({members.length})</h2>
        <ul className="divide-y divide-violet-50">
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <Avatar name={m.name} id={m.userId} size="h-8 w-8 text-xs" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{m.name}</span>
                {m.userId === actor.userId && <span className="text-xs text-slate-400"> (du)</span>}
                {m.role === "admin" && <span className="chip ml-1.5 bg-amber-100 text-amber-800">Admin</span>}
                <span className="block text-xs text-slate-400">seit {formatShort(m.joinedAt)}</span>
              </span>
              <ActionForm action={setMemberRole.bind(null, slug)} className="flex">
                <input type="hidden" name="userId" value={m.userId} />
                <input type="hidden" name="role" value={m.role === "admin" ? "member" : "admin"} />
                {!(m.role === "admin" && admins <= 1) && (
                  <Submit className="btn-secondary px-3 py-1.5">{m.role === "admin" ? "Admin entziehen" : "Zum Admin machen"}</Submit>
                )}
              </ActionForm>
              {m.userId !== actor.userId && !(m.role === "admin" && admins <= 1) && (
                <ActionForm action={removeMember.bind(null, slug)} className="flex">
                  <input type="hidden" name="userId" value={m.userId} />
                  <Submit className="text-xs font-semibold text-rose-600 hover:underline" confirm={`${m.name} aus der Community entfernen?`}>Entfernen</Submit>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
