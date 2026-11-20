// Bild-Upload per klassischem multipart-Formular (kein Body-Limit wie bei Server Actions).
import { getActor } from "@/lib/auth/session";
import { safeRedirectTarget, siteUrl } from "@/lib/domains";
import { errorMessage } from "@/lib/errors";
import { UUID_RE } from "@/lib/utils";
import { uploadImages, type UploadTarget } from "@/services/images";

export const dynamic = "force-dynamic";

function back(returnTo: string, params: Record<string, string>) {
  const url = new URL(returnTo);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return Response.redirect(url, 303);
}

export async function POST(req: Request) {
  const form = await req.formData();
  const returnTo = safeRedirectTarget(form.get("returnTo"));
  const actor = await getActor();
  if (!actor) return Response.redirect(siteUrl(`/login?next=${encodeURIComponent(returnTo)}`), 303);

  const eventId = String(form.get("eventId") ?? "");
  const target: UploadTarget =
    form.get("target") === "event" && UUID_RE.test(eventId) ? { kind: "event", eventId } : { kind: "homepage" };
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  try {
    const r = await uploadImages(actor, target, files, String(form.get("caption") ?? "") || null);
    return back(returnTo, {
      ...(r.uploaded ? { uploaded: String(r.uploaded) } : {}),
      ...(r.errors.length ? { uploadError: r.errors.join("; ") } : {}),
    });
  } catch (e) {
    return back(returnTo, { uploadError: errorMessage(e) });
  }
}
