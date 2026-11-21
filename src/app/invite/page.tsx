import { getActor } from "@/lib/auth/session";
import { siteUrl } from "@/lib/domains";
import { teaser } from "@/lib/utils";
import { peekInvite } from "@/services/communities";
import { acceptInvite } from "@/app/actions/communities";
import { ActionForm, Submit } from "@/components/form";
import { CommunityLogo } from "@/components/decor";

export const metadata = { title: "Einladung", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const inv = token ? await peekInvite(token) : null;
  if (!token || !inv) {
    return (
      <div className="card mx-auto max-w-md space-y-3">
        <h1>Einladung ungültig</h1>
        <p className="text-sm text-slate-600">Die Einladung ist abgelaufen, wurde widerrufen oder bereits verwendet. Bitte frag nach einer neuen.</p>
        <a href="/communities" className="btn">Communities ansehen</a>
      </div>
    );
  }
  const actor = await getActor();
  const self = siteUrl(`/invite?token=${encodeURIComponent(token)}`);
  return (
    <div className="card mx-auto max-w-md space-y-4 text-center">
      <div className="flex justify-center"><CommunityLogo title={inv.title} slug={inv.slug} logoImageId={inv.logoImageId} size="h-20 w-20 text-3xl" /></div>
      <h1>Du bist eingeladen!</h1>
      <p>
        Tritt der Community <strong>{inv.title}</strong> bei.
      </p>
      {inv.description && <p className="text-sm text-slate-600">{teaser(inv.description, 240)}</p>}
      {actor ? (
        <ActionForm action={acceptInvite.bind(null, token)}>
          <Submit className="btn w-full">Einladung annehmen</Submit>
        </ActionForm>
      ) : (
        <div className="space-y-2">
          <a href={`/register?next=${encodeURIComponent(self)}`} className="btn w-full">Konto erstellen & beitreten</a>
          <a href={`/login?next=${encodeURIComponent(self)}`} className="btn-secondary w-full">Ich habe schon ein Konto</a>
        </div>
      )}
    </div>
  );
}
