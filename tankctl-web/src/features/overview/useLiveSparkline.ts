import { useEffect, useRef, useState } from 'react'
import { useSparkline } from '../../api/telemetry'
import { useLiveEvent } from '../../ws/LiveEventsProvider'

export interface SparklinePoint {
  t: Date
  value: number
}

const SPARKLINE_MAX = 12

/**
 * Mirrors useTankTelemetry's live-tail pattern (seed from a query, then
 * append via the telemetry_received WS event) scoped down to one series
 * for the Overview grid's per-card sparkline.
 */
export function useLiveSparkline(deviceId: string): SparklinePoint[] {
  const { data } = useSparkline(deviceId)
  const [points, setPoints] = useState<SparklinePoint[]>([])
  const seededForRef = useRef<string | null>(null)

  useEffect(() => {
    if (!data) return
    const seedKey = `${deviceId}:${data.count}`
    if (seededForRef.current === seedKey) return
    seededForRef.current = seedKey
    setPoints(
      data.data
        .filter((p) => p.temperature !== null)
        .map((p) => ({ t: new Date(p.time), value: p.temperature as number })),
    )
  }, [data, deviceId])

  useLiveEvent(['telemetry_received'], (event) => {
    if (event.device_id !== deviceId) return
    const meta = (event.metadata ?? {}) as Record<string, unknown>
    const temperature = typeof meta.temperature === 'number' ? meta.temperature : undefined
    if (temperature === undefined) return
    const t = new Date(event.timestamp * 1000)
    setPoints((prev) => [...prev.slice(-(SPARKLINE_MAX - 1)), { t, value: temperature }])
  })

  return points
}
