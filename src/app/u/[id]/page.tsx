import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getActor } from "@/lib/auth/session";
import { orNotFound } from "@/lib/errors";
import { UUID_RE } from "@/lib/utils";
import { viewHomepage } from "@/services/homepages";
import { ImageGallery } from "@/components/image-gallery";
import { RichText } from "@/components/rich-text";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return {};
  const hp = await viewHomepage(await getActor(), id).catch(() => null);
  return hp ? { title: hp.title, robots: hp.visibility === "public" ? undefined : { index: false } } : {};
}

export default async function HomepageView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const hp = await orNotFound(viewHomepage(await getActor(), id));

  return (
    <article className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-4xl"><span className="text-gradient">{hp.title}</span></h1>
          <p className="mt-1 text-sm text-slate-500">von {hp.ownerName}</p>
        </div>
        {hp.isOwner && <a href="/homepage" className="btn-secondary">Bearbeiten</a>}
      </header>
      {hp.content && (
        <section className="card">
          <RichText text={hp.content} />
        </section>
      )}
      {hp.images.length > 0 && (
        <section className="space-y-3">
          <h2>Bilder</h2>
          <ImageGallery images={hp.images.map((i) => ({ id: i.id, caption: i.caption, width: i.width, height: i.height, canDelete: false }))} emptyText="" />
        </section>
      )}
    </article>
  );
}
