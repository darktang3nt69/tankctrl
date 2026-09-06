/**
 * Safe/caution/danger bands for water-quality readings.
 *
 * pH/ammonia/nitrite/nitrate ranges follow the API Freshwater Master Test Kit's
 * color-chart conventions for a general community freshwater tank (species-
 * dependent — adjust if your livestock need tighter bounds). TDS is NOT part of
 * that kit (it only tests pH/ammonia/nitrite/nitrate); the TDS band below is a
 * separate general freshwater-aquarium guideline.
 */

export type WaterQualityParam = 'ph' | 'ammonia' | 'nitrite' | 'nitrate' | 'tds'

const WATER_QUALITY_RANGES: Record<WaterQualityParam, { safe: [number, number]; caution: [number, number] }> = {
  ph: { safe: [6.5, 7.5], caution: [6.0, 8.0] },
  ammonia: { safe: [0, 0], caution: [0, 0.25] },
  nitrite: { safe: [0, 0], caution: [0, 0.5] },
  nitrate: { safe: [0, 20], caution: [0, 40] },
  tds: { safe: [150, 300], caution: [100, 400] },
}

/**
 * Returns 'safe' → 'ok' | 'caution' → 'warn' | 'danger' → 'danger' for StatusPill,
 * or null if value is None or param unknown.
 */
export function waterQualityStatus(
  param: WaterQualityParam,
  value: number | null | undefined,
): 'ok' | 'warn' | 'danger' | null {
  if (value === null || value === undefined || !WATER_QUALITY_RANGES[param]) {
    return null
  }
  const ranges = WATER_QUALITY_RANGES[param]
  const [safeLo, safeHi] = ranges.safe
  const [cautionLo, cautionHi] = ranges.caution
  if (safeLo <= value && value <= safeHi) {
    return 'ok'
  }
  if (cautionLo <= value && value <= cautionHi) {
    return 'warn'
  }
  return 'danger'
}
