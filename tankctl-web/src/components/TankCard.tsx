import { Link } from 'react-router-dom'
import type { Device } from '../api/types'
import { StatusPill, type PillTone } from './StatusPill'
import { Sparkline } from './Sparkline'
import { useSetLight } from '../api/commands'
import { useSparkline } from '../api/telemetry'
import { useToast } from './Toast'
import './TankCard.css'

function statusTone(status: Device['status']): PillTone {
  if (status === 'online') return 'ok'
  if (status === 'time_unknown') return 'warn'
  return 'danger'
}

export function TankCard({ device, alertCount }: { device: Device; alertCount: number }) {
  const setLight = useSetLight(device.device_id)
  const toast = useToast()
  const { data: telemetry } = useSparkline(device.device_id)
  const sparkline = (telemetry?.data ?? []).map((p) => p.temperature).filter((v): v is number => v !== null)

  // The overview list doesn't fetch each device's shadow (20+ tanks would mean
  // 20+ extra requests just to know current light state) — so the quick action
  // here is explicit on/off, not a state-guessing toggle.
  function handleSetLight(e: React.MouseEvent, state: 'on' | 'off') {
    e.preventDefault()
    e.stopPropagation()
    setLight.mutate(state, {
      onError: () => toast.show(`Couldn't set light for ${device.device_name ?? device.device_id}`, 'danger'),
    })
  }

  return (
    <Link to={`/tanks/${device.device_id}`} className="tank-card">
      <div className="tank-card__head">
        <span className="tank-card__name">{device.device_name ?? device.device_id}</span>
        <StatusPill tone={statusTone(device.status)} />
      </div>
      {sparkline.length > 1 && (
        <div className="tank-card__spark">
          <Sparkline values={sparkline} color="var(--series-temp)" />
        </div>
      )}
      <div className="tank-card__foot">
        <div className="tank-card__light-actions">
          <button type="button" className="btn" onClick={(e) => handleSetLight(e, 'on')} disabled={setLight.isPending}>
            Light on
          </button>
          <button type="button" className="btn" onClick={(e) => handleSetLight(e, 'off')} disabled={setLight.isPending}>
            Light off
          </button>
        </div>
        {alertCount > 0 && <span className="tank-card__alert-badge">{alertCount}</span>}
      </div>
    </Link>
  )
}
