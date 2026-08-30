import { useState } from 'react'
import type { LightSchedule } from '../../api/types'
import { useSetLight } from '../../api/commands'
import { useSaveLightSchedule, useDeleteLightSchedule } from '../../api/lightSchedule'
import { useToast } from '../../components/Toast'
import './tab-panels.css'

/** Mounted with `key={deviceId}` by TankDetail, so switching tanks remounts
 * this component fresh rather than needing an effect to resync form state. */
export function LightTab({ deviceId, lightSchedule }: { deviceId: string; lightSchedule: LightSchedule | null }) {
  const setLight = useSetLight(deviceId)
  const saveSchedule = useSaveLightSchedule(deviceId)
  const deleteSchedule = useDeleteLightSchedule(deviceId)
  const toast = useToast()

  const [onTime, setOnTime] = useState(lightSchedule?.on_time ?? '06:00')
  const [offTime, setOffTime] = useState(lightSchedule?.off_time ?? '18:00')
  const [enabled, setEnabled] = useState(lightSchedule?.enabled ?? true)

  function handleSetLight(state: 'on' | 'off') {
    setLight.mutate(state, {
      onSuccess: () => toast.show(`Light turned ${state}`),
      onError: () => toast.show('Failed to set light', 'danger'),
    })
  }

  function handleSaveSchedule(e: React.FormEvent) {
    e.preventDefault()
    saveSchedule.mutate(
      { on_time: onTime, off_time: offTime, enabled },
      {
        onSuccess: () => toast.show('Light schedule saved'),
        onError: () => toast.show('Failed to save schedule', 'danger'),
      },
    )
  }

  function handleDeleteSchedule() {
    deleteSchedule.mutate(undefined, {
      onSuccess: () => toast.show('Light schedule deleted'),
      onError: () => toast.show('Failed to delete schedule', 'danger'),
    })
  }

  return (
    <div>
      <section className="card tab-section">
        <h3 className="tab-section__title">Manual override</h3>
        <div className="tab-section__actions">
          <button type="button" className="btn btn--primary" onClick={() => handleSetLight('on')} disabled={setLight.isPending}>
            Turn on
          </button>
          <button type="button" className="btn" onClick={() => handleSetLight('off')} disabled={setLight.isPending}>
            Turn off
          </button>
        </div>
      </section>

      <section className="card tab-section">
        <h3 className="tab-section__title">Schedule</h3>
        <form onSubmit={handleSaveSchedule}>
          <div className="field">
            <label htmlFor="on-time">On time</label>
            <input id="on-time" type="time" value={onTime} onChange={(e) => setOnTime(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="off-time">Off time</label>
            <input id="off-time" type="time" value={offTime} onChange={(e) => setOffTime(e.target.value)} required />
          </div>
          <div className="field">
            <label>
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled
            </label>
          </div>
          <div className="tab-section__actions">
            <button type="submit" className="btn btn--primary" disabled={saveSchedule.isPending}>
              Save schedule
            </button>
            {lightSchedule && (
              <button type="button" className="btn btn--danger" onClick={handleDeleteSchedule} disabled={deleteSchedule.isPending}>
                Delete schedule
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  )
}
