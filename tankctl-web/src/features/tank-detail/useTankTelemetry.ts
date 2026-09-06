import { useEffect, useRef, useState } from 'react'
import { useHourlySummary, useRawTelemetry, rangeToHours, LIVE_POLL_INTERVAL_MS } from '../../api/telemetry'
import type { ChartRange, DateRange } from '../../api/telemetry'
import { useLiveConnectionStatus, useLiveEvent } from '../../ws/LiveEventsProvider'
import type { ChartPoint } from '../../components/LineChart'

interface LiveSeries {
  temp: ChartPoint[]
  tds: ChartPoint[]
}

const LIVE_BUFFER_MAX = 288 // ~48h at 10 min resolution — generous ring buffer, mirrors the doc's telemetry-strategy sizing

/**
 * The spec's three-tier telemetry strategy: hourly rollup for 7d/30d/custom,
 * raw telemetry seeded once for the live view, then a WS tail appended
 * continuously — falling back to polling if the socket degrades. Never
 * silently stops updating; `stale` tells the caller to say so.
 */
export function useTankTelemetry(deviceId: string, range: ChartRange, customRange?: DateRange) {
  const isLive = range === 'live'
  const status = useLiveConnectionStatus()
  const hours = rangeToHours(range)

  const raw = useRawTelemetry(deviceId, hours, isLive)
  const hourly = useHourlySummary(deviceId, hours, !isLive, range === 'custom' ? customRange : undefined)

  const [liveBuffer, setLiveBuffer] = useState<LiveSeries>({ temp: [], tds: [] })
  const seededForRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isLive || !raw.data) return
    const seedKey = `${deviceId}:${raw.data.count}`
    if (seededForRef.current === seedKey) return
    seededForRef.current = seedKey
    setLiveBuffer({
      temp: raw.data.data
        .filter((p) => p.temperature !== null)
        .map((p) => ({ t: new Date(p.time), value: p.temperature as number })),
      tds: raw.data.data
        .filter((p) => p.tds !== null)
        .map((p) => ({ t: new Date(p.time), value: p.tds as number })),
    })
  }, [isLive, raw.data, deviceId])

  useLiveEvent(['telemetry_received'], (event) => {
    if (!isLive || event.device_id !== deviceId) return
    const meta = (event.metadata ?? {}) as Record<string, unknown>
    const temperature = typeof meta.temperature === 'number' ? meta.temperature : undefined
    const tds = typeof meta.tds === 'number' ? meta.tds : undefined
    const t = new Date(event.timestamp * 1000)
    setLiveBuffer((prev) => ({
      temp: temperature !== undefined ? [...prev.temp.slice(-(LIVE_BUFFER_MAX - 1)), { t, value: temperature }] : prev.temp,
      tds: tds !== undefined ? [...prev.tds.slice(-(LIVE_BUFFER_MAX - 1)), { t, value: tds }] : prev.tds,
    }))
  })

  useEffect(() => {
    if (!isLive || status !== 'polling-fallback') return
    const id = window.setInterval(() => raw.refetch(), LIVE_POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [isLive, status, raw])

  if (!isLive) {
    const temp: ChartPoint[] = (hourly.data?.data ?? [])
      .filter((p) => p.temperature)
      .map((p) => ({ t: new Date(p.hour), value: p.temperature!.avg }))
    const tds: ChartPoint[] = (hourly.data?.data ?? [])
      .filter((p) => p.tds)
      .map((p) => ({ t: new Date(p.hour), value: p.tds!.avg }))
    return { temp, tds, isLoading: hourly.isLoading, stale: false, dayTicks: true }
  }

  return {
    temp: liveBuffer.temp,
    tds: liveBuffer.tds,
    isLoading: raw.isLoading && liveBuffer.temp.length === 0,
    stale: status !== 'connected',
    dayTicks: false,
  }
}
