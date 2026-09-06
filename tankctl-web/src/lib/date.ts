import { getTimezone } from './preferences'

/** YYYY-MM-DD from a Date's local calendar fields — never toISOString(), which
 * converts to UTC first and shifts the date whenever the browser's timezone
 * isn't UTC (e.g. 00:30 IST is still 19:00 the previous day in UTC). */
export function toLocalDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Centralized date/time formatting so every screen renders the same shape,
 * in the user's configured timezone (Settings), instead of each call site
 * picking its own locale-default format (the "crooked dates" the app used to
 * show — a mix of "9/1/2026, 2:30:00 PM", "Sep 1", "2:30 PM" and similar). */
export function formatDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: getTimezone(),
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d)
}

export function formatTime(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: getTimezone(),
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export function formatDateTime(d: Date): string {
  return `${formatDate(d)}, ${formatTime(d)}`
}
