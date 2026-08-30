/** YYYY-MM-DD from a Date's local calendar fields — never toISOString(), which
 * converts to UTC first and shifts the date whenever the browser's timezone
 * isn't UTC (e.g. 00:30 IST is still 19:00 the previous day in UTC). */
export function toLocalDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
