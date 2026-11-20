import "server-only";
import { headers } from "next/headers";

/** Client-IP hinter Cloudflare-Tunnel bzw. Proxy (für Rate-Limits). */
export async function clientIp() {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0].trim() ?? "unbekannt";
}
