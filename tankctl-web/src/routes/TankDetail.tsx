import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useDeviceDetail } from '../api/devices'
import { StatusPill, type PillTone } from '../components/StatusPill'
import { StatTile } from '../components/StatTile'
import { LineChart } from '../components/LineChart'
import { Tabs } from '../components/Tabs'
import { EmptyState } from '../components/EmptyState'
import { useTankTelemetry } from '../features/tank-detail/useTankTelemetry'
import type { ChartRange } from '../api/telemetry'
import { LightTab } from '../features/tank-detail/LightTab'
import { RelaysTab } from '../features/tank-detail/RelaysTab'
import { WaterTab } from '../features/tank-detail/WaterTab'
import { CommandsTab } from '../features/tank-detail/CommandsTab'
import { IconCommands, IconLight, IconRelay, IconWater } from '../components/icons'
import './TankDetail.css'

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
  if (isLoading) return <p>Loading tank…</p>
  if (isError || !device) {
    return (
      <EmptyState
        title="Tank not found"
        description={`No device with id "${deviceId}".`}
        action={
          <Link to="/" className="btn">
            Back to Overview
          </Link>
        }
      />
    )
  }

  const lastTemp = telemetry.temp.at(-1)
  const lastHumidity = telemetry.humidity.at(-1)

  return (
    <div>
      <div className="hud-frame tank-detail__frame">
        <header className="tank-detail__header">
          <div>
            <Link to="/" className="tank-detail__back">
              ← Overview
            </Link>
            <h1>{device.device_name ?? device.device_id}</h1>
          </div>
          <div className="tank-detail__header-meta">
            {relativeLastSeen && <span className="tank-detail__updated mono">Updated {relativeLastSeen}</span>}
            <StatusPill tone={statusTone(device.status)} />
          </div>
        </header>

        <div className="tank-detail__stats">
          <StatTile label="Water temperature" value={lastTemp ? lastTemp.value.toFixed(1) : '—'} unit="°C" />
          <StatTile label="Humidity" value={lastHumidity ? lastHumidity.value.toFixed(1) : '—'} unit="%" />
          <StatTile label="Last seen" value={device.last_seen ? new Date(device.last_seen).toLocaleTimeString() : '—'} />
        </div>
      </div>

      {telemetry.stale && range === 'live' && (
        <div className="tank-detail__stale-banner" role="status">
          Live feed degraded — showing last known reading and polling every 15s.
        </div>
      )}

      <div className="tank-detail__range-row">
        <div className="tank-detail__range-picker" role="group" aria-label="Time range">
          {(['live', '7d', '30d'] as ChartRange[]).map((r) => (
            <button
              key={r}
              type="button"
              className="tank-detail__range-btn"
              aria-pressed={range === r}
              onClick={() => setRange(r)}
            >
              {r === 'live' ? 'Live' : r}
            </button>
          ))}
        </div>
      </div>

      <div className="card tank-detail__chart-block">
        <h3 className="tank-detail__chart-title">Water temperature</h3>
        {telemetry.isLoading ? (
          <p>Loading chart…</p>
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

      <div className="card tank-detail__chart-block">
        <h3 className="tank-detail__chart-title">Humidity</h3>
        {telemetry.isLoading ? (
          <p>Loading chart…</p>
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

      <div className="tank-detail__tabs-block">
        <Tabs tabs={TABS} activeId={activeTab} onChange={handleTabChange} />
        <div className="tank-detail__tab-panel">
          {activeTab === 'light' && <LightTab key={deviceId} deviceId={deviceId} lightSchedule={device.light_schedule} />}
          {activeTab === 'relays' && <RelaysTab key={deviceId} deviceId={deviceId} />}
          {activeTab === 'water' && <WaterTab key={deviceId} deviceId={deviceId} />}
          {activeTab === 'commands' && <CommandsTab key={deviceId} deviceId={deviceId} />}
        </div>
      </div>
    </div>
  )
}
