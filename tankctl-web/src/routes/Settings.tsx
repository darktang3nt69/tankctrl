import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDevices, useRegisterDevice } from '../api/devices'
import { useToast } from '../components/Toast'
import '../features/tank-detail/tab-panels.css'
import './Settings.css'

export function Settings() {
  const { data: devices } = useDevices()
  const registerDevice = useRegisterDevice()
  const toast = useToast()

  const [deviceId, setDeviceId] = useState('')
  const [secret, setSecret] = useState<{ device_secret: string; mqtt_password: string } | null>(null)

  function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    registerDevice.mutate(deviceId, {
      onSuccess: (res) => {
        setSecret({ device_secret: res.device_secret, mqtt_password: res.mqtt_password })
        setDeviceId('')
      },
      onError: () => toast.show('Failed to register device — is the id already taken?', 'danger'),
    })
  }

  return (
    <div>
      <h1 className="page-title">Settings</h1>

      <section className="card tab-section">
        <h3 className="tab-section__title">Register a device</h3>
        <form onSubmit={handleRegister}>
          <div className="field">
            <label htmlFor="new-device-id">Device ID</label>
            <input
              id="new-device-id"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              placeholder="tank1"
              pattern="[a-zA-Z0-9_-]+"
              required
            />
            <span className="field__hint">Alphanumeric, underscore, hyphen only.</span>
          </div>
          <button type="submit" className="btn btn--primary" disabled={registerDevice.isPending}>
            Register
          </button>
        </form>

        {secret && (
          <div className="settings__secret-box" role="alert">
            <p className="settings__secret-warning">
              Copy these now — they will not be shown again.
            </p>
            <p className="mono">device_secret: {secret.device_secret}</p>
            <p className="mono">mqtt_password: {secret.mqtt_password}</p>
          </div>
        )}
      </section>

      <section className="card tab-section">
        <h3 className="tab-section__title">Devices</h3>
        {(devices ?? []).length === 0 ? (
          <p className="field__hint">No devices registered yet.</p>
        ) : (
          <ul className="settings__device-list">
            {(devices ?? []).map((d) => (
              <li key={d.device_id} className="tab-section__row">
                <div className="tab-section__row-main">
                  <span className="tab-section__row-title">{d.device_name ?? d.device_id}</span>
                  <span className="tab-section__row-meta mono">{d.device_id}</span>
                </div>
                <Link to={`/tanks/${d.device_id}?tab=relays`} className="btn">
                  Configure relays
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
