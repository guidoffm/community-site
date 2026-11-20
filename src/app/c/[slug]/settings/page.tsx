import { requireActor } from "@/lib/auth/session";
import { communityUrl } from "@/lib/domains";
import { orNotFound } from "@/lib/errors";
import { manageContext } from "@/services/communities";
import { updateCommunity } from "@/app/actions/communities";
import { ActionForm, Submit } from "@/components/form";
import { CommunityLogo } from "@/components/decor";

export const metadata = { title: "Community bearbeiten" };
export const dynamic = "force-dynamic";

export default async function CommunitySettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const actor = await requireActor();
  const community = await orNotFound(manageContext(actor, slug));

  return (
    <div className="card mx-auto max-w-2xl">
      <a href={communityUrl(slug)} className="link text-sm">← {community.title}</a>
      <div className="mt-3 flex items-center gap-4">
        <CommunityLogo title={community.title} slug={slug} />
        <div>
          <h1>Community bearbeiten</h1>
          <p className="text-sm text-slate-500">{communityUrl(slug).replace(/^https?:\/\//, "").replace(/\/$/, "")}</p>
        </div>
      </div>
      <ActionForm action={updateCommunity.bind(null, slug)} className="mt-6 space-y-4">
        <label className="block">
          <span className="label">Titel *</span>
          <input name="title" required minLength={3} maxLength={80} defaultValue={community.title} className="input" />
        </label>
        <label className="block">
          <span className="label">Beschreibung</span>
          <textarea name="description" rows={8} maxLength={2000} defaultValue={community.description} className="input" />
          <span className="mt-1 block text-xs text-slate-500">Zeilenumbrüche werden übernommen. Die Adresse (Slug) lässt sich nicht ändern.</span>
        </label>
        <div className="flex gap-2">
          <Submit className="btn">Speichern</Submit>
          <a href={communityUrl(slug)} className="btn-secondary">Abbrechen</a>
        </div>
      </ActionForm>
    </div>
  );
}
