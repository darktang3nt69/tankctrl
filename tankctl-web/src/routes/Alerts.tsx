import { useState } from 'react'
import { useDevices } from '../api/devices'
import { useDismissAttention, useEventTypes, useEvents } from '../api/events'
import { useToast } from '../components/Toast'
import { EmptyState } from '../components/EmptyState'
import './Alerts.css'

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
  const toast = useToast()

  function deviceLabel(deviceId: string | null) {
    if (!deviceId) return '—'
    const d = devices?.find((dev) => dev.device_id === deviceId)
    return d?.device_name ?? deviceId
  }

  return (
    <div>
      <h1 className="page-title">Alerts</h1>
      <div className="search-filter-bar">
        <select value={deviceFilter} onChange={(e) => setDeviceFilter(e.target.value)} aria-label="Filter by device">
          <option value="">All devices</option>
          {(devices ?? []).map((d) => (
            <option key={d.device_id} value={d.device_id}>
              {d.device_name ?? d.device_id}
            </option>
          ))}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filter by event type">
          <option value="">All types</option>
          {(eventTypes ?? []).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <p>Loading alerts…</p>
      ) : !events || events.length === 0 ? (
        <EmptyState title="No alerts" description="Nothing to review right now." />
      ) : (
        <div className="card">
          {events.map((e, i) => {
            const meta = e.metadata as Record<string, unknown>
            return (
              <div key={i} className="alerts__row">
                <div className="alerts__row-main">
                  <span className="alerts__row-title">{e.event}</span>
                  <span className="alerts__row-meta mono">
                    {new Date(e.timestamp * 1000).toLocaleString()} · {deviceLabel(e.device_id)}
                    {typeof meta.message === 'string' ? ` · ${meta.message}` : ''}
                  </span>
                </div>
                {e.event === 'device_warning' && e.device_id && (
                  <button
                    type="button"
                    className="btn"
                    disabled={dismiss.isPending}
                    onClick={() =>
                      dismiss.mutate(
                        {
                          device_id: e.device_id as string,
                          issue_key: String(meta.code ?? 'unknown'),
                          issue_type: 'device_warning',
                        },
                        {
                          onSuccess: () => toast.show('Alert acknowledged'),
                          onError: () => toast.show('Failed to acknowledge alert', 'danger'),
                        },
                      )
                    }
                  >
                    Acknowledge
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
