import { TermsText } from "@/components/terms-text";

export const metadata = { title: "Nutzungsbedingungen", alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return (
    <article className="card mx-auto max-w-3xl">
      <h1><span className="text-gradient">Nutzungsbedingungen</span></h1>
      <TermsText />
    </article>
  );
}
