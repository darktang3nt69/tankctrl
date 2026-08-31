import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useDeviceDetail } from '../api/devices'
import { StatusPill, type PillTone } from '../components/StatusPill'
import { StatTile } from '../components/StatTile'
import { LineChart } from '../components/LineChart'
import { Tabs } from '../components/Tabs'
import { EmptyState } from '../components/EmptyState'
import { Button } from '../components/ui/button'
import { useTankTelemetry } from '../features/tank-detail/useTankTelemetry'
import type { ChartRange } from '../api/telemetry'
import { LightTab } from '../features/tank-detail/LightTab'
import { RelaysTab } from '../features/tank-detail/RelaysTab'
import { WaterTab } from '../features/tank-detail/WaterTab'
import { CommandsTab } from '../features/tank-detail/CommandsTab'
import { IconCommands, IconLight, IconRelay, IconWater } from '../components/icons'

const TABS = [
  { id: 'light', label: 'Light', Icon: IconLight },
  { id: 'relays', label: 'Relays', Icon: IconRelay },
  { id: 'water', label: 'Water', Icon: IconWater },
  { id: 'commands', label: 'Commands', Icon: IconCommands },
]

const LAST_TAB_KEY = 'tankctl:last-detail-tab'

function useRelativeTime(iso: string | null | undefined) {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [])
  if (!iso) return null
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  return `${Math.floor(seconds / 3600)}h ago`
}

function statusTone(status: string): PillTone {
  if (status === 'online') return 'ok'
  if (status === 'time_unknown') return 'warn'
  return 'danger'
}

export function TankDetail() {
  const { deviceId } = useParams<{ deviceId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const [range, setRange] = useState<ChartRange>('live')

  const { data: device, isLoading, isError } = useDeviceDetail(deviceId ?? '')
  const telemetry = useTankTelemetry(deviceId ?? '', range)
  const relativeLastSeen = useRelativeTime(device?.last_seen)

  const activeTab = searchParams.get('tab') ?? window.localStorage.getItem(LAST_TAB_KEY) ?? 'light'

  function handleTabChange(id: string) {
    window.localStorage.setItem(LAST_TAB_KEY, id)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', id)
      return next
    })
  }

  if (!deviceId) return null
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading tank…</p>
  if (isError || !device) {
    return (
      <EmptyState
        title="Tank not found"
        description={`No device with id "${deviceId}".`}
        action={
          <Button asChild variant="outline">
            <Link to="/">Back to Overview</Link>
          </Button>
        }
      />
    )
  }

  const lastTemp = telemetry.temp.at(-1)
  const lastHumidity = telemetry.humidity.at(-1)

  return (
    <div>
      <div className="hud-frame mb-4 rounded-lg border bg-card">
        <header className="flex items-start justify-between gap-4">
          <div>
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
              ← Overview
            </Link>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{device.device_name ?? device.device_id}</h1>
          </div>
          <div className="flex items-center gap-3">
            {relativeLastSeen && <span className="font-mono text-xs text-muted-foreground">Updated {relativeLastSeen}</span>}
            <StatusPill tone={statusTone(device.status)} />
          </div>
        </header>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <StatTile label="Water temperature" value={lastTemp ? lastTemp.value.toFixed(1) : '—'} unit="°C" />
          <StatTile label="Humidity" value={lastHumidity ? lastHumidity.value.toFixed(1) : '—'} unit="%" />
          <StatTile label="Last seen" value={device.last_seen ? new Date(device.last_seen).toLocaleTimeString() : '—'} />
        </div>
      </div>

      {telemetry.stale && range === 'live' && (
        <div role="status" className="mb-4 rounded-md border border-[var(--warn)] bg-[var(--warn-fill)] px-3 py-2 text-sm">
          Live feed degraded — showing last known reading and polling every 15s.
        </div>
      )}

      <div className="mb-4 flex gap-1 rounded-md border bg-muted p-1" role="group" aria-label="Time range">
        {(['live', '7d', '30d'] as ChartRange[]).map((r) => (
          <Button
            key={r}
            type="button"
            variant={range === r ? 'default' : 'ghost'}
            size="sm"
            aria-pressed={range === r}
            onClick={() => setRange(r)}
          >
            {r === 'live' ? 'Live' : r}
          </Button>
        ))}
      </div>

      <div className="mb-4 rounded-lg border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold">Water temperature</h3>
        {telemetry.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading chart…</p>
        ) : (
          <LineChart
            data={telemetry.temp}
            unit="°C"
            color="var(--series-temp)"
            fillColor="var(--series-temp-fill)"
            stale={telemetry.stale}
            dayTicks={telemetry.dayTicks}
            ariaLabel="Water temperature over time"
          />
        )}
      </div>

      <div className="mb-4 rounded-lg border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold">Humidity</h3>
        {telemetry.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading chart…</p>
        ) : (
          <LineChart
            data={telemetry.humidity}
            unit="%"
            color="var(--series-humid)"
            fillColor="var(--series-humid-fill)"
            stale={telemetry.stale}
            dayTicks={telemetry.dayTicks}
            ariaLabel="Humidity over time"
          />
        )}
      </div>

      <div>
        <Tabs tabs={TABS} activeId={activeTab} onChange={handleTabChange} />
        <div className="mt-4">
          {activeTab === 'light' && <LightTab key={deviceId} deviceId={deviceId} lightSchedule={device.light_schedule} />}
          {activeTab === 'relays' && <RelaysTab key={deviceId} deviceId={deviceId} />}
          {activeTab === 'water' && <WaterTab key={deviceId} deviceId={deviceId} />}
          {activeTab === 'commands' && <CommandsTab key={deviceId} deviceId={deviceId} />}
        </div>
      </div>
    </div>
  )
}
