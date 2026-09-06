import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, Lightbulb, PlusCircle, Terminal, WifiOff, Wifi, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useDevices } from '../api/devices'
import { useDismissAttention, useEventTypes, useEvents } from '../api/events'
import { EmptyState } from '../components/EmptyState'
import { Button } from '../components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { StatusIcon } from '../components/ui/status-icon'
import { eventLabel } from '../lib/eventLabels'
import { formatDateTime } from '../lib/date'

const EVENT_ICON: Record<string, { icon: LucideIcon; state: 'on' | 'off' | 'online' | 'offline' | 'warn' }> = {
  device_registered: { icon: PlusCircle, state: 'online' },
  device_online: { icon: Wifi, state: 'online' },
  device_offline: { icon: WifiOff, state: 'offline' },
  command_sent: { icon: Terminal, state: 'on' },
  command_executed: { icon: CheckCircle2, state: 'online' },
  command_failed: { icon: XCircle, state: 'offline' },
  light_state_changed: { icon: Lightbulb, state: 'on' },
  device_warning: { icon: AlertTriangle, state: 'warn' },
}
const DEFAULT_EVENT_ICON = { icon: Info, state: 'off' as const }

export function Alerts() {
  const [deviceFilter, setDeviceFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const { data: devices } = useDevices()
  const { data: eventTypes } = useEventTypes()
  const { data: events, isLoading } = useEvents({
    deviceId: deviceFilter || undefined,
    eventType: typeFilter || undefined,
  })
  const dismiss = useDismissAttention()

  function deviceLabel(deviceId: string | null) {
    if (!deviceId) return '—'
    const d = devices?.find((dev) => dev.device_id === deviceId)
    return d?.device_name ?? deviceId
  }

  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold tracking-tight">Alerts</h1>
      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={deviceFilter || 'all'} onValueChange={(v) => setDeviceFilter(v === 'all' ? '' : v)}>
          <SelectTrigger aria-label="Filter by device" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All devices</SelectItem>
            {(devices ?? []).map((d) => (
              <SelectItem key={d.device_id} value={d.device_id}>
                {d.device_name ?? d.device_id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter || 'all'} onValueChange={(v) => setTypeFilter(v === 'all' ? '' : v)}>
          <SelectTrigger aria-label="Filter by event type" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {(eventTypes ?? []).map((t) => (
              <SelectItem key={t} value={t}>
                {eventLabel(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading alerts…</p>
      ) : !events || events.length === 0 ? (
        <EmptyState title="No alerts" description="Nothing to review right now." />
      ) : (
        <div className="divide-y rounded-lg border bg-card">
          {events.map((e, i) => {
            const meta = e.metadata as Record<string, unknown>
            const code = e.event === 'device_warning' && typeof meta.code === 'string' ? meta.code : null
            return (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <StatusIcon icon={(EVENT_ICON[e.event] ?? DEFAULT_EVENT_ICON).icon} state={(EVENT_ICON[e.event] ?? DEFAULT_EVENT_ICON).state} className="size-8 shrink-0" />
                <div className="flex flex-1 flex-col gap-0.5">
                  <span className="font-medium">
                    {eventLabel(e.event)}
                    {code && <span className="ml-1.5 font-mono text-xs text-muted-foreground">({code})</span>}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatDateTime(new Date(e.timestamp * 1000))} · {deviceLabel(e.device_id)}
                    {typeof meta.message === 'string' ? ` · ${meta.message}` : ''}
                  </span>
                </div>
                {e.event === 'device_warning' && e.device_id && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={dismiss.isPending}
                    onClick={() =>
                      dismiss.mutate(
                        {
                          device_id: e.device_id as string,
                          issue_key: String(meta.code ?? 'unknown'),
                          issue_type: 'device_warning',
                        },
                        {
                          onSuccess: () => toast.success('Alert acknowledged'),
                          onError: () => toast.error('Failed to acknowledge alert'),
                        },
                      )
                    }
                  >
                    Acknowledge
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
