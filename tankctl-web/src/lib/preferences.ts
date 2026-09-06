/** App-wide preferences: single browser, single user (see PRODUCT.md) — plain
 * localStorage is enough, no backend persistence needed. */

const TIMEZONE_KEY = 'tankctl:timezone'
const ACCENT_KEY = 'tankctl:accent-color'

export const DEFAULT_ACCENT = '#f59e0b' // matches the existing --primary amber token

export function getTimezone(): string {
  try {
    return window.localStorage.getItem(TIMEZONE_KEY) ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

export function setTimezone(tz: string): void {
  window.localStorage.setItem(TIMEZONE_KEY, tz)
}

export function getAccentColor(): string {
  try {
    return window.localStorage.getItem(ACCENT_KEY) ?? DEFAULT_ACCENT
  } catch {
    return DEFAULT_ACCENT
  }
}

export function setAccentColor(hex: string): void {
  window.localStorage.setItem(ACCENT_KEY, hex)
  applyAccentColor(hex)
}

/** Sets the CSS custom properties the theme's --primary/--accent tokens read from. */
export function applyAccentColor(hex: string): void {
  document.documentElement.style.setProperty('--primary', hex)
  document.documentElement.style.setProperty('--accent', hex)
}
