import { useState } from 'react'
import { toast } from 'sonner'
import { useDevices } from '../api/devices'
import { useDismissAttention, useEventTypes, useEvents } from '../api/events'
import { EmptyState } from '../components/EmptyState'
import { Button } from '../components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { eventLabel } from '../lib/eventLabels'

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
              <div key={i} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">
                    {eventLabel(e.event)}
                    {code && <span className="ml-1.5 font-mono text-xs text-muted-foreground">({code})</span>}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {new Date(e.timestamp * 1000).toLocaleString()} · {deviceLabel(e.device_id)}
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
