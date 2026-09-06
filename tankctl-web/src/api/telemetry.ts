import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { HourlySummaryResponse, TelemetryResponse } from './types'

export type ChartRange = 'live' | '7d' | '30d' | 'custom'

export interface DateRange {
  from: Date
  to: Date
}

/** Raw telemetry — used for the live view's initial window on mount. */
export function useRawTelemetry(deviceId: string, hours: number, enabled: boolean) {
  return useQuery({
    queryKey: ['device', deviceId, 'telemetry', 'raw', hours],
    queryFn: () => api.get<TelemetryResponse>(`/devices/${deviceId}/telemetry?hours=${hours}&limit=1000`),
    enabled: Boolean(deviceId) && enabled,
    staleTime: Infinity, // fetched once on mount; the live tail appends via WS from here
  })
}

/** Hourly rollup — used for the 7d/30d/custom ranges (real TimescaleDB continuous aggregate).
 * Pass `customRange` for arbitrary from/to exploration; it takes precedence over `hours`. */
export function useHourlySummary(
  deviceId: string,
  hours: number,
  enabled: boolean,
  customRange?: DateRange,
) {
  const rangeKey = customRange ? `${customRange.from.toISOString()}:${customRange.to.toISOString()}` : hours
  return useQuery({
    queryKey: ['device', deviceId, 'telemetry', 'hourly', rangeKey],
    queryFn: () => {
      const params = customRange
        ? `start=${customRange.from.toISOString()}&end=${customRange.to.toISOString()}`
        : `hours=${hours}`
      return api.get<HourlySummaryResponse>(`/devices/${deviceId}/telemetry/hourly/summary?${params}`)
    },
    enabled: Boolean(deviceId) && enabled,
  })
}

/** Small, cheap per-card fetch for the Overview grid's mini sparkline —
 * deliberately not `useRawTelemetry` (that one is sized/cached for a single
 * Tank Detail mount, not for N cards on one page). */
export function useSparkline(deviceId: string) {
  return useQuery({
    queryKey: ['device', deviceId, 'telemetry', 'sparkline'],
    queryFn: () => api.get<TelemetryResponse>(`/devices/${deviceId}/telemetry?limit=12`),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

export function rangeToHours(range: ChartRange): number {
  if (range === '7d') return 7 * 24
  if (range === '30d') return 30 * 24
  if (range === 'custom') return 24 // unused when a customRange {from,to} is supplied
  return 1 // 'live': raw telemetry seed window before the WS tail takes over
}

/** Poll interval used as a WS-outage fallback for the live range only. */
export const LIVE_POLL_INTERVAL_MS = 15_000
