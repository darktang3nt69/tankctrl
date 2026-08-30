import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { HourlySummaryResponse, TelemetryResponse } from './types'

export type ChartRange = 'live' | '7d' | '30d'

/** Raw telemetry — used for the live view's initial window on mount. */
export function useRawTelemetry(deviceId: string, hours: number, enabled: boolean) {
  return useQuery({
    queryKey: ['device', deviceId, 'telemetry', 'raw', hours],
    queryFn: () => api.get<TelemetryResponse>(`/devices/${deviceId}/telemetry?hours=${hours}&limit=1000`),
    enabled: Boolean(deviceId) && enabled,
    staleTime: Infinity, // fetched once on mount; the live tail appends via WS from here
  })
}

/** Hourly rollup — used for the 7d/30d ranges (real TimescaleDB continuous aggregate). */
export function useHourlySummary(deviceId: string, hours: number, enabled: boolean) {
  return useQuery({
    queryKey: ['device', deviceId, 'telemetry', 'hourly', hours],
    queryFn: () => api.get<HourlySummaryResponse>(`/devices/${deviceId}/telemetry/hourly/summary?hours=${hours}`),
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
  return 1 // 'live': raw telemetry seed window before the WS tail takes over
}

/** Poll interval used as a WS-outage fallback for the live range only. */
export const LIVE_POLL_INTERVAL_MS = 15_000
