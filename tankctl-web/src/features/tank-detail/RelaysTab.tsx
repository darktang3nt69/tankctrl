import { useState } from 'react'
import type { RelayConfig, RelayConfigWrite } from '../../api/types'
import { useCreateRelay, useDeleteRelay, usePushRelayConfig, useRelays, useUpdateRelay } from '../../api/relays'
import { useSetDesiredState, useShadow } from '../../api/shadow'
import { useToast } from '../../components/Toast'
import { EmptyState } from '../../components/EmptyState'
import './tab-panels.css'

const EMPTY_FORM: RelayConfigWrite = {
  relay_name: '',
  gpio_pin: 0,
  active_level: 'LOW',
  default_state: 'off',
  fail_safe_default: 'off',
  cutoff_ceiling_seconds: null,
}

function RelayForm({
  initial,
  lockName,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial: RelayConfigWrite
  lockName: boolean
  onSubmit: (body: RelayConfigWrite) => void
  onCancel: () => void
  submitting: boolean
}) {
  const [form, setForm] = useState(initial)

  return (
    <form
      className="tab-section tab-section--muted"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(form)
      }}
    >
      <div className="field">
        <label htmlFor="relay-name">Relay name</label>
        <input
          id="relay-name"
          value={form.relay_name}
          disabled={lockName}
          onChange={(e) => setForm((f) => ({ ...f, relay_name: e.target.value }))}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="relay-gpio">GPIO pin</label>
        <input
          id="relay-gpio"
          type="number"
          min={0}
          max={39}
          value={form.gpio_pin}
          onChange={(e) => setForm((f) => ({ ...f, gpio_pin: Number(e.target.value) }))}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="relay-active-level">Active level</label>
        <select
          id="relay-active-level"
          value={form.active_level}
          onChange={(e) => setForm((f) => ({ ...f, active_level: e.target.value as 'LOW' | 'HIGH' }))}
        >
          <option value="LOW">LOW</option>
          <option value="HIGH">HIGH</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="relay-default-state">Default state (on boot)</label>
        <select
          id="relay-default-state"
          value={form.default_state}
          onChange={(e) => setForm((f) => ({ ...f, default_state: e.target.value as 'on' | 'off' }))}
        >
          <option value="off">off</option>
          <option value="on">on</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="relay-fail-safe">Fail-safe default</label>
        <select
          id="relay-fail-safe"
          value={form.fail_safe_default}
          onChange={(e) => setForm((f) => ({ ...f, fail_safe_default: e.target.value as 'on' | 'off' }))}
        >
          <option value="off">off</option>
          <option value="on">on</option>
        </select>
        <span className="field__hint">State forced when the device can't trust its network/time.</span>
      </div>
      <div className="field">
        <label htmlFor="relay-cutoff">Cutoff ceiling (seconds, blank = no ceiling)</label>
        <input
          id="relay-cutoff"
          type="number"
          min={1}
          value={form.cutoff_ceiling_seconds ?? ''}
          onChange={(e) =>
            setForm((f) => ({ ...f, cutoff_ceiling_seconds: e.target.value === '' ? null : Number(e.target.value) }))
          }
        />
      </div>
      <div className="tab-section__actions">
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          Save relay
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

export function RelaysTab({ deviceId }: { deviceId: string }) {
  const { data: relayConfig, isLoading } = useRelays(deviceId)
  const { data: shadow } = useShadow(deviceId)
  const createRelay = useCreateRelay(deviceId)
  const updateRelay = useUpdateRelay(deviceId)
  const deleteRelay = useDeleteRelay(deviceId)
  const pushConfig = usePushRelayConfig(deviceId)
  const setDesired = useSetDesiredState(deviceId)
  const toast = useToast()

  const [adding, setAdding] = useState(false)
  const [editingName, setEditingName] = useState<string | null>(null)

  const relays: [string, RelayConfig][] = relayConfig ? Object.entries(relayConfig.relays) : []

  function toggleRelay(name: string, state: 'on' | 'off') {
    setDesired.mutate(
      { [name]: state },
      {
        onSuccess: () => toast.show(`${name} set to ${state}`),
        onError: () => toast.show(`Failed to set ${name}`, 'danger'),
      },
    )
  }

  if (isLoading) return <p>Loading relays…</p>

  return (
    <div>
      <div className="tab-section__actions tab-section__actions--spaced">
        <button type="button" className="btn btn--primary" onClick={() => setAdding(true)}>
          Add relay
        </button>
        <button
          type="button"
          className="btn"
          disabled={pushConfig.isPending}
          onClick={() =>
            pushConfig.mutate(undefined, {
              onSuccess: () => toast.show('Relay config pushed to device'),
              onError: () => toast.show('Failed to push config', 'danger'),
            })
          }
        >
          Push config to device
        </button>
      </div>

      {adding && (
        <RelayForm
          initial={EMPTY_FORM}
          lockName={false}
          submitting={createRelay.isPending}
          onCancel={() => setAdding(false)}
          onSubmit={(body) =>
            createRelay.mutate(body, {
              onSuccess: () => {
                toast.show('Relay created')
                setAdding(false)
              },
              onError: () => toast.show('Failed to create relay', 'danger'),
            })
          }
        />
      )}

      {relays.length === 0 && !adding ? (
        <EmptyState title="No relays configured" description="Add a relay to control it from here." />
      ) : (
        <div className="card">
          {relays.map(([name, relay]) =>
            editingName === name ? (
              <RelayForm
                key={name}
                initial={{ ...relay, relay_name: name }}
                lockName
                submitting={updateRelay.isPending}
                onCancel={() => setEditingName(null)}
                onSubmit={(body) =>
                  updateRelay.mutate(
                    { relayName: name, body },
                    {
                      onSuccess: () => {
                        toast.show('Relay updated')
                        setEditingName(null)
                      },
                      onError: () => toast.show('Failed to update relay', 'danger'),
                    },
                  )
                }
              />
            ) : (
              <div key={name} className="tab-section__row">
                <div className="tab-section__row-main">
                  <span className="tab-section__row-title">{name}</span>
                  <span className="tab-section__row-meta mono">
                    GPIO {relay.gpio_pin} · reported: {shadow?.reported[name] ?? 'unknown'}
                  </span>
                </div>
                <div className="tab-section__actions">
                  <button type="button" className="btn" onClick={() => toggleRelay(name, 'on')} disabled={setDesired.isPending}>
                    On
                  </button>
                  <button type="button" className="btn" onClick={() => toggleRelay(name, 'off')} disabled={setDesired.isPending}>
                    Off
                  </button>
                  <button type="button" className="btn" onClick={() => setEditingName(name)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn--danger"
                    onClick={() =>
                      deleteRelay.mutate(name, {
                        onSuccess: () => toast.show('Relay deleted'),
                        onError: () => toast.show('Failed to delete relay', 'danger'),
                      })
                    }
                  >
                    Delete
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  )
}
