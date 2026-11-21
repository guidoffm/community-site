import { requireActor } from "@/lib/auth/session";
import { acceptTerms } from "@/app/actions/auth";
import { ActionForm, Submit } from "@/components/form";
import { TermsText } from "@/components/terms-text";

export const metadata = { title: "Nutzungsbedingungen bestätigen", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AcceptTermsPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const actor = await requireActor({ allowPendingTerms: true });
  const { next } = await searchParams;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="card">
        <h1><span className="text-gradient">Nutzungsbedingungen</span></h1>
        <p className="mt-2 text-sm text-slate-600">
          Hallo {actor.name}, bitte lies und bestätige unsere Nutzungsbedingungen, um 15k weiter zu nutzen.
        </p>
        <div className="mt-4 max-h-[50vh] overflow-y-auto rounded-xl border border-violet-100 p-4">
          <TermsText />
        </div>
        <ActionForm action={acceptTerms} className="mt-4 space-y-3">
          <input type="hidden" name="next" value={next ?? "/"} />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="accept" required className="mt-1 accent-[#7c3aed]" />
            Ich habe die Nutzungsbedingungen gelesen und stimme ihnen zu.
          </label>
          <Submit className="btn">Zustimmen und weiter</Submit>
        </ActionForm>
      </div>
    </div>
  );
}
