import { ActionForm, Submit } from "@/components/form";
import { createCommunity } from "@/app/actions/communities";
import { requireActor } from "@/lib/auth/session";
import { ROOT_DOMAIN } from "@/lib/domains";
import { notFound } from "next/navigation";

export const metadata = { title: "Neue Community" };

export default async function NewCommunityPage() {
  const actor = await requireActor();
  if (!actor.isSiteAdmin) notFound();
  return (
    <div className="card mx-auto max-w-xl">
      <h1 className="mb-4">Neue Community gründen</h1>
      <ActionForm action={createCommunity} className="space-y-4">
        <label className="block">
          <span className="label">Titel *</span>
          <input name="title" required minLength={3} maxLength={80} className="input" />
        </label>
        <label className="block">
          <span className="label">Adresse (Slug)</span>
          <span className="flex items-center gap-1 text-sm">
            <input name="slug" pattern="[a-z0-9][a-z0-9\-]{1,48}[a-z0-9]" maxLength={50} placeholder="wird aus dem Titel erzeugt" className="input" />
            <span className="whitespace-nowrap text-slate-500">.{ROOT_DOMAIN}</span>
          </span>
          <span className="mt-1 block text-xs text-slate-500">Kleinbuchstaben, Ziffern und Bindestriche, 3–50 Zeichen.</span>
        </label>
        <label className="block">
          <span className="label">Beschreibung</span>
          <textarea name="description" rows={4} maxLength={2000} className="input" />
        </label>
        <Submit className="btn">Community gründen</Submit>
      </ActionForm>
    </div>
  );
}
