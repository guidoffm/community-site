import { getActor } from "@/lib/auth/session";
import { UUID_RE } from "@/lib/utils";
import { readImage } from "@/services/images";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return new Response("Nicht gefunden", { status: 404 });
  const variant = new URL(req.url).searchParams.get("size") === "thumb" ? "thumb" : "full";
  try {
    const img = await readImage(await getActor(), id, variant);
    return new Response(new Uint8Array(img.data), {
      headers: {
        "Content-Type": img.contentType,
        "Content-Length": String(img.data.length),
        // Bilder sind unveränderlich (UUID); nicht-öffentliche nur im Browser-Cache
        "Cache-Control": img.isPublic ? "public, max-age=604800, immutable" : "private, max-age=86400, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  } catch {
    return new Response("Nicht gefunden", { status: 404 });
  }
}
