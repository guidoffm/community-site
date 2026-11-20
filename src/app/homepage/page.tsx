import { requireActor } from "@/lib/auth/session";
import { MAX_IMAGES_PER_HOMEPAGE } from "@/lib/images";
import { myHomepage } from "@/services/homepages";
import { deleteHomepage, deleteImage, saveHomepage } from "@/app/actions/homepage";
import { ActionForm, Submit } from "@/components/form";
import { ImageGallery } from "@/components/image-gallery";
import { ImageUploadForm, UploadFeedback } from "@/components/image-upload-form";
import { siteUrl } from "@/lib/domains";

export const metadata = { title: "Meine Homepage" };
export const dynamic = "force-dynamic";

export default async function EditHomepagePage({ searchParams }: { searchParams: Promise<{ uploaded?: string; uploadError?: string }> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const hp = await myHomepage(actor);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1><span className="text-gradient">Meine Homepage</span></h1>
        {hp && <a href={`/u/${actor.userId}`} className="btn-secondary">Ansehen</a>}
      </div>

      <section className="card">
        <ActionForm action={saveHomepage} className="space-y-4">
          <label className="block">
            <span className="label">Titel</span>
            <input name="title" required maxLength={150} defaultValue={hp?.title ?? `Homepage von ${actor.name}`} className="input" />
          </label>
          <label className="block">
            <span className="label">Text</span>
            <textarea name="content" rows={12} maxLength={50000} defaultValue={hp?.content ?? ""} className="input" placeholder="Erzähl etwas über dich, deine Hobbys, …" />
            <span className="mt-1 block text-xs text-slate-500">Zeilenumbrüche werden übernommen; Links werden automatisch klickbar.</span>
          </label>
          <fieldset className="space-y-1">
            <legend className="label">Wer darf die Homepage sehen?</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="visibility" value="members" defaultChecked={hp?.visibility !== "public"} />
              Nur Mitglieder meiner Communities (eingeloggt)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="visibility" value="public" defaultChecked={hp?.visibility === "public"} />
              Öffentlich – jeder mit dem Link ({siteUrl(`/u/${actor.userId}`).replace(/^https?:\/\//, "")})
            </label>
          </fieldset>
          <Submit className="btn">{hp ? "Speichern" : "Homepage anlegen"}</Submit>
        </ActionForm>
      </section>

      {hp && (
        <section className="card space-y-4">
          <h2>Bilder ({hp.images.length}/{MAX_IMAGES_PER_HOMEPAGE})</h2>
          <UploadFeedback uploaded={sp.uploaded} uploadError={sp.uploadError} />
          <ImageGallery
            images={hp.images.map((i) => ({ id: i.id, caption: i.caption, width: i.width, height: i.height, canDelete: true }))}
            deleteAction={deleteImage}
            emptyText="Noch keine Bilder hochgeladen."
          />
          <ImageUploadForm target="homepage" returnTo={siteUrl("/homepage")} />
        </section>
      )}

      {hp && (
        <form action={deleteHomepage}>
          <button className="btn-danger" data-confirm="Homepage inkl. aller Bilder endgültig löschen?">Homepage löschen</button>
        </form>
      )}
    </div>
  );
}
