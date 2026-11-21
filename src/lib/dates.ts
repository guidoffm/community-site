import { formatInTimeZone, fromZonedTime } from "date-fns-tz"
import { de } from "date-fns/locale"
export const TIMEZONE = process.env.APP_TIMEZONE ?? "Europe/Berlin"

/** Wert aus <input type="datetime-local"> in der App-Zeitzone interpretieren. */
export function parseLocalDateTime(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const d = fromZonedTime(value, TIMEZONE)
  return isNaN(d.getTime()) ? null : d
}

export function formatDateTime(d: Date) {
  return formatInTimeZone(d, TIMEZONE, "EEEE, d. MMMM yyyy, HH:mm 'Uhr'", { locale: de })
}

export function formatShort(d: Date) {
  return formatInTimeZone(d, TIMEZONE, "dd.MM.yyyy HH:mm", { locale: de })
}

export function formatTime(d: Date) {
  return formatInTimeZone(d, TIMEZONE, "HH:mm 'Uhr'", { locale: de })
}

export function formatEventRange(start: Date, end: Date | null) {
  if (!end) return formatDateTime(start)
  const sameDay =
    formatInTimeZone(start, TIMEZONE, "yyyy-MM-dd") === formatInTimeZone(end, TIMEZONE, "yyyy-MM-dd")
  return sameDay ? `${formatDateTime(start)} – ${formatTime(end)}` : `${formatDateTime(start)} – ${formatDateTime(end)}`
}

/** Für <input type="datetime-local"> in der App-Zeitzone */
export function toLocalInput(d: Date) {
  return formatInTimeZone(d, TIMEZONE, "yyyy-MM-dd'T'HH:mm");
}
