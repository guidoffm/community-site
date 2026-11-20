import { getActor } from "@/lib/auth/session";
import { communityUrl, siteUrl } from "@/lib/domains";
import { slugify, UUID_RE } from "@/lib/utils";
import { eventIcs } from "@/services/events";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ slug: string; eventId: string }> }) {
  const { slug, eventId } = await params;
  const actor = await getActor();
  if (!actor) {
    const next = communityUrl(slug, `/events/${eventId}`);
    return Response.redirect(siteUrl(`/login?next=${encodeURIComponent(next)}`), 303);
  }
  if (!UUID_RE.test(eventId)) return new Response("Nicht gefunden", { status: 404 });
  try {
    const { title, ics } = await eventIcs(actor, slug, eventId);
    return new Response(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slugify(title)}.ics"`,
      },
    });
  } catch {
    return new Response("Nicht gefunden", { status: 404 });
  }
}
