import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useDeviceDetail } from '../api/devices'
import { StatusPill, type PillTone } from '../components/StatusPill'
import { StatTile } from '../components/StatTile'
import { LineChart } from '../components/LineChart'
import { Tabs } from '../components/Tabs'
import { EmptyState } from '../components/EmptyState'
import { Button } from '../components/ui/button'
import { Calendar } from '../components/ui/calendar'
import { Input } from '../components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover'
import { useTankTelemetry } from '../features/tank-detail/useTankTelemetry'
import type { ChartRange, DateRange } from '../api/telemetry'
import type { DateRange as PickerDateRange } from 'react-day-picker'
import { LightTab } from '../features/tank-detail/LightTab'
import { RelaysTab } from '../features/tank-detail/RelaysTab'
import { WaterTab } from '../features/tank-detail/WaterTab'
import { CommandsTab } from '../features/tank-detail/CommandsTab'
import { IconCommands, IconLight, IconRelay, IconWater } from '../components/icons'
import { formatDate, formatTime, formatDateTime } from '../lib/date'

const PRESETS: { id: ChartRange; label: string }[] = [
  { id: 'live', label: 'Live' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
]

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
  const [customRange, setCustomRange] = useState<DateRange | undefined>()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [draftRange, setDraftRange] = useState<PickerDateRange>({ from: undefined, to: undefined })
  const [draftTime, setDraftTime] = useState({ from: '00:00', to: '23:59' })

  const { data: device, isLoading, isError } = useDeviceDetail(deviceId ?? '')
  const telemetry = useTankTelemetry(deviceId ?? '', range, customRange)
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
  const lastTds = telemetry.tds.at(-1)

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
          <StatTile label="TDS" value={lastTds ? lastTds.value.toFixed(0) : '—'} unit="ppm" />
          <StatTile label="Last seen" value={device.last_seen ? formatTime(new Date(device.last_seen)) : '—'} />
        </div>
      </div>

      {telemetry.stale && range === 'live' && (
        <div role="status" className="mb-4 rounded-md border border-[var(--warn)] bg-[var(--warn-fill)] px-3 py-2 text-sm">
          Live feed degraded — showing last known reading and polling every 15s.
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Time range">
        <div className="flex gap-1 rounded-md border bg-muted p-1">
          {PRESETS.map((p) => (
            <Button
              key={p.id}
              type="button"
              variant={range === p.id ? 'default' : 'ghost'}
              size="sm"
              aria-pressed={range === p.id}
              onClick={() => setRange(p.id)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <Popover open={pickerOpen} onOpenChange={(open) => {
          setPickerOpen(open)
          if (open) {
            setDraftRange(customRange ? { from: customRange.from, to: customRange.to } : { from: undefined, to: undefined })
            setDraftTime({ from: '00:00', to: '23:59' })
          }
        }}>
          <PopoverTrigger asChild>
            <Button type="button" variant={range === 'custom' ? 'default' : 'outline'} size="sm">
              {range === 'custom' && customRange ? (() => {
                const hasNonDefaultTimes = (
                  (customRange.from && (customRange.from.getHours() !== 0 || customRange.from.getMinutes() !== 0)) ||
                  (customRange.to && (customRange.to.getHours() !== 23 || customRange.to.getMinutes() !== 59))
                )
                return hasNonDefaultTimes
                  ? `${formatDateTime(customRange.from)} – ${formatDateTime(customRange.to)}`
                  : `${formatDate(customRange.from)} – ${formatDate(customRange.to)}`
              })() : 'Custom range'}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="range"
              numberOfMonths={2}
              selected={draftRange}
              onSelect={(next) => setDraftRange(next ?? { from: undefined, to: undefined })}
              className="max-w-[560px]"
            />
            <div className="space-y-2 border-t p-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">From</label>
                  <Input type="time" value={draftTime.from} onChange={(e) => setDraftTime({ ...draftTime, from: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">To</label>
                  <Input type="time" value={draftTime.to} onChange={(e) => setDraftTime({ ...draftTime, to: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t p-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setPickerOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!draftRange.from || !draftRange.to}
                onClick={() => {
                  if (!draftRange.from || !draftRange.to) return
                  // Parse time strings and apply to dates
                  const [fromHours, fromMinutes] = draftTime.from.split(':').map(Number)
                  const [toHours, toMinutes] = draftTime.to.split(':').map(Number)
                  const from = new Date(draftRange.from)
                  from.setHours(fromHours, fromMinutes, 0, 0)
                  const to = new Date(draftRange.to)
                  to.setHours(toHours, toMinutes, 0, 0)
                  setCustomRange({ from, to })
                  setRange('custom')
                  setPickerOpen(false)
                }}
              >
                Apply
              </Button>
            </div>
          </PopoverContent>
        </Popover>
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
        <h3 className="mb-3 text-sm font-semibold">TDS</h3>
        {telemetry.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading chart…</p>
        ) : (
          <LineChart
            data={telemetry.tds}
            unit="ppm"
            color="var(--series-tds)"
            fillColor="var(--series-tds-fill)"
            stale={telemetry.stale}
            dayTicks={telemetry.dayTicks}
            ariaLabel="TDS over time"
          />
        )}
      </div>

      <div>
        <Tabs tabs={TABS} activeId={activeTab} onChange={handleTabChange} />
        <div className="mt-4">
          {activeTab === 'light' && <LightTab key={deviceId} deviceId={deviceId} lightSchedule={device.light_schedule} />}
          {activeTab === 'relays' && <RelaysTab key={deviceId} deviceId={deviceId} boardType={device.board_type} />}
          {activeTab === 'water' && <WaterTab key={deviceId} deviceId={deviceId} />}
          {activeTab === 'commands' && <CommandsTab key={deviceId} deviceId={deviceId} />}
        </div>
      </div>
    </div>
  )
}
