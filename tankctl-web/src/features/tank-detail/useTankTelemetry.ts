import { useEffect, useRef, useState } from 'react'
import { useHourlySummary, useRawTelemetry, rangeToHours, LIVE_POLL_INTERVAL_MS } from '../../api/telemetry'
import type { ChartRange } from '../../api/telemetry'
import { useLiveConnectionStatus, useLiveEvent } from '../../ws/LiveEventsProvider'
import type { ChartPoint } from '../../components/LineChart'

interface LiveSeries {
  temp: ChartPoint[]
  humidity: ChartPoint[]
}

const LIVE_BUFFER_MAX = 288 // ~48h at 10 min resolution — generous ring buffer, mirrors the doc's telemetry-strategy sizing

/**
 * The spec's three-tier telemetry strategy: hourly rollup for 7d/30d, raw
 * telemetry seeded once for the live view, then a WS tail appended
 * continuously — falling back to polling if the socket degrades. Never
 * silently stops updating; `stale` tells the caller to say so.
 */
export function useTankTelemetry(deviceId: string, range: ChartRange) {
  const isLive = range === 'live'
  const status = useLiveConnectionStatus()
  const hours = rangeToHours(range)

  const raw = useRawTelemetry(deviceId, hours, isLive)
  const hourly = useHourlySummary(deviceId, hours, !isLive)

  const [liveBuffer, setLiveBuffer] = useState<LiveSeries>({ temp: [], humidity: [] })
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
      humidity: raw.data.data
        .filter((p) => p.humidity !== null)
        .map((p) => ({ t: new Date(p.time), value: p.humidity as number })),
    })
  }, [isLive, raw.data, deviceId])

  useLiveEvent(['telemetry_received'], (event) => {
    if (!isLive || event.device_id !== deviceId) return
    const meta = (event.metadata ?? {}) as Record<string, unknown>
    const temperature = typeof meta.temperature === 'number' ? meta.temperature : undefined
    const humidity = typeof meta.humidity === 'number' ? meta.humidity : undefined
    const t = new Date(event.timestamp * 1000)
    setLiveBuffer((prev) => ({
      temp: temperature !== undefined ? [...prev.temp.slice(-(LIVE_BUFFER_MAX - 1)), { t, value: temperature }] : prev.temp,
      humidity:
        humidity !== undefined ? [...prev.humidity.slice(-(LIVE_BUFFER_MAX - 1)), { t, value: humidity }] : prev.humidity,
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
    const humidity: ChartPoint[] = (hourly.data?.data ?? [])
      .filter((p) => p.humidity)
      .map((p) => ({ t: new Date(p.hour), value: p.humidity!.avg }))
    return { temp, humidity, isLoading: hourly.isLoading, stale: false, dayTicks: true }
  }

  return {
    temp: liveBuffer.temp,
    humidity: liveBuffer.humidity,
    isLoading: raw.isLoading && liveBuffer.temp.length === 0,
    stale: status !== 'connected',
    dayTicks: false,
  }
}
