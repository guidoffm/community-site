import { APP_NAME, MAIN_HOST, communityUrl } from "./domains"
import { eventMapUrl } from "./maps"

type IcsEvent = {
  id: string
  title: string
  description: string
  location: string
  mapUrl?: string | null
  startsAt: Date
  endsAt: Date | null
  updatedAt: Date
  url: string
}

function esc(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n")
}

function utc(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
}

/** Zeilen auf 75 Oktette falten (RFC 5545, 3.1), ohne UTF-8-Zeichen zu zerteilen. */
function fold(line: string) {
  const out: string[] = []
  let current = ""
  let bytes = 0
  for (const ch of line) {
    const len = Buffer.byteLength(ch)
    const limit = out.length === 0 ? 75 : 74
    if (bytes + len > limit) {
      out.push(current)
      current = ""
      bytes = 0
    }
    current += ch
    bytes += len
  }
  out.push(current)
  return out.join("\r\n ")
}

export function buildIcs(event: IcsEvent, method: "PUBLISH" | "CANCEL" = "PUBLISH") {
  const host = MAIN_HOST.replace(/:\d+$/, "")
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${esc(APP_NAME)}//Community Events//DE`,
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:event-${event.id}@${host}`,
    `DTSTAMP:${utc(new Date())}`,
    `LAST-MODIFIED:${utc(event.updatedAt)}`,
    `SEQUENCE:${Math.floor(event.updatedAt.getTime() / 1000)}`,
    `DTSTART:${utc(event.startsAt)}`,
    ...(event.endsAt ? [`DTEND:${utc(event.endsAt)}`] : []),
    `SUMMARY:${esc(event.title)}`,
    `DESCRIPTION:${esc(`${event.description}\n\nOrt: ${event.location}\nKarte: ${eventMapUrl(event)}\n\n${event.url}`)}`,
    `LOCATION:${esc(event.location)}`,
    `URL:${event.url}`,
    ...(method === "CANCEL" ? ["STATUS:CANCELLED"] : ["STATUS:CONFIRMED"]),
    "END:VEVENT",
    "END:VCALENDAR",
  ]
  return lines.map(fold).join("\r\n") + "\r\n"
}

export function eventUrl(slug: string, eventId: string) {
  return communityUrl(slug, `/events/${eventId}`)
}
