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
 *   <slug>.15k.de/settings         → intern /c/<slug>/settings (Admins)
 *   (/api/* läuft auf jedem Host direkt, z. B. Bilder)
 *   <slug>.15k.de/<sonstiges>      → 308 auf www.15k.de/<sonstiges>
 *
 * Außerdem: Sicherheits-Header für alle Seiten und sofortiges 404 für typische Scanner-Pfade
 * (.env, .php, WordPress …), ohne dass eine Seite gerendert wird.
 */
const COMMUNITY_PATHS = /^\/(?:$|events(?:\/|$)|messages\/new$|settings$)/

/** Pfade, nach denen Bots suchen – gibt es hier nie. (Zusätzlich blockt die Cloudflare-WAF.) */
const SCANNER_PATHS =
  /(?:^|\/)(?:\.env|\.git|\.svn|\.hg|\.aws|\.ssh|\.DS_Store|wp-|wordpress|xmlrpc|phpmyadmin|pma|cgi-bin|vendor\/phpunit|actuator|server-status)|\.(?:php\d?|phtml|asp|aspx|jsp|cgi|sql|bak|old|swp)$/i

const isDev = process.env.NODE_ENV !== "production"
const communityOrigins = `${PROTOCOL}//*.${ROOT_DOMAIN}`
const CSP = [
  "default-src 'self'",
  // Next.js nutzt Inline-Skripte für die Hydration
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  // Login auf www leitet auf die Community-Subdomain weiter (und umgekehrt)
  `form-action 'self' ${APP_URL} ${communityOrigins}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ")

function secure(res: NextResponse) {
  const h = res.headers
  h.set("Content-Security-Policy", CSP)
  h.set("X-Frame-Options", "DENY")
  h.set("X-Content-Type-Options", "nosniff")
  h.set("Referrer-Policy", "strict-origin-when-cross-origin")
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")
  h.set("Cross-Origin-Opener-Policy", "same-origin")
  if (PROTOCOL === "https:") h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
  return res
}

export function proxy(req: NextRequest) {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").toLowerCase()
  const { pathname, search } = req.nextUrl

  if (SCANNER_PATHS.test(pathname)) {
    return secure(new NextResponse("Not Found", { status: 404, headers: { "Content-Type": "text/plain" } }))
  }

  // Öffentliche URL für Login-Rücksprung (requireActor)
  const headers = new Headers(req.headers)
  headers.set("x-url", `${PROTOCOL}//${host}${pathname}${search}`)

  if (host === ROOT_DOMAIN && ROOT_DOMAIN !== MAIN_HOST) {
    return secure(NextResponse.redirect(`${APP_URL}${pathname}${search}`, 308))
  }

  const slug = slugFromHost(host)
  if (!slug) {
    const m = pathname.match(/^\/c\/([^/]+)(\/.*)?$/)
    if (m && host === MAIN_HOST) return secure(NextResponse.redirect(communityUrl(m[1], (m[2] ?? "/") + search), 308))
    return secure(NextResponse.next({ request: { headers } }))
  }

  if (COMMUNITY_PATHS.test(pathname)) {
    const url = req.nextUrl.clone()
    url.pathname = `/c/${slug}${pathname === "/" ? "" : pathname}`
    return secure(NextResponse.rewrite(url, { request: { headers } }))
  }
  if (pathname.startsWith("/c/")) {
    // Alte/interne Pfade auf der Subdomain bereinigen
    return secure(NextResponse.redirect(communityUrl(slug, pathname.replace(/^\/c\/[^/]+/, "") + search), 308))
  }
  return secure(NextResponse.redirect(`${APP_URL}${pathname}${search}`, 308))
}

export const config = {
  // API, Next-Assets und statische Root-Dateien laufen auf jedem Host direkt.
  matcher: ["/((?!api/|_next/|favicon\\.ico$|icon\\.svg$|robots\\.txt$|sitemap\\.xml$).*)"],
}
