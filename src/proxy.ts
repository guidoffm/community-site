import { NextResponse, type NextRequest } from "next/server"
import { APP_URL, MAIN_HOST, PROTOCOL, ROOT_DOMAIN, communityUrl, slugFromHost } from "@/lib/domains"

/**
 * Host-basiertes Routing:
 *   www.15k.de/...                 → normale Routen
 *   15k.de/...                     → 308 auf www.15k.de/...
 *   www.15k.de/c/<slug>/...        → 308 auf <slug>.15k.de/...
 *   <slug>.15k.de/                 → intern /c/<slug>
 *   <slug>.15k.de/events/...       → intern /c/<slug>/events/...
 *   <slug>.15k.de/messages/new     → intern /c/<slug>/messages/new
 *   (/api/* läuft auf jedem Host direkt, z. B. Bilder)
 *   <slug>.15k.de/<sonstiges>      → 308 auf www.15k.de/<sonstiges>
 */
const COMMUNITY_PATHS = /^\/(?:$|events(?:\/|$)|messages\/new$)/

export function proxy(req: NextRequest) {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").toLowerCase()
  const { pathname, search } = req.nextUrl

  // Öffentliche URL für Login-Rücksprung (requireActor)
  const headers = new Headers(req.headers)
  headers.set("x-url", `${PROTOCOL}//${host}${pathname}${search}`)

  if (host === ROOT_DOMAIN && ROOT_DOMAIN !== MAIN_HOST) {
    return NextResponse.redirect(`${APP_URL}${pathname}${search}`, 308)
  }

  const slug = slugFromHost(host)
  if (!slug) {
    const m = pathname.match(/^\/c\/([^/]+)(\/.*)?$/)
    if (m && host === MAIN_HOST) return NextResponse.redirect(communityUrl(m[1], (m[2] ?? "/") + search), 308)
    return NextResponse.next({ request: { headers } })
  }

  if (COMMUNITY_PATHS.test(pathname)) {
    const url = req.nextUrl.clone()
    url.pathname = `/c/${slug}${pathname === "/" ? "" : pathname}`
    return NextResponse.rewrite(url, { request: { headers } })
  }
  if (pathname.startsWith("/c/")) {
    // Alte/interne Pfade auf der Subdomain bereinigen
    return NextResponse.redirect(communityUrl(slug, pathname.replace(/^\/c\/[^/]+/, "") + search), 308)
  }
  return NextResponse.redirect(`${APP_URL}${pathname}${search}`, 308)
}

export const config = {
  // API, Next-Assets und statische Root-Dateien laufen auf jedem Host direkt.
  matcher: ["/((?!api/|_next/|favicon\\.ico$|icon\\.svg$|robots\\.txt$).*)"],
}
