import { useState } from 'react'
import type { WaterScheduleType, WaterScheduleWrite } from '../../api/types'
import './tab-panels.css'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function WaterScheduleForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
}: {
  initial: WaterScheduleWrite
  submitting: boolean
  onSubmit: (body: WaterScheduleWrite) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<WaterScheduleWrite>(initial)

  function update<K extends keyof WaterScheduleWrite>(key: K, value: WaterScheduleWrite[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function toggleWeekday(day: number) {
    const current = form.days_of_week ?? []
    update('days_of_week', current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort())
  }

  return (
    <form
      className="tab-section tab-section--muted"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(form)
      }}
    >
      <div className="field">
        <label htmlFor="ws-type">Cadence</label>
        <select id="ws-type" value={form.schedule_type} onChange={(e) => update('schedule_type', e.target.value as WaterScheduleType)}>
          <option value="weekly">Weekly (recurring)</option>
          <option value="custom">One-off date</option>
          <option value="interval">Every N days</option>
        </select>
      </div>

      {form.schedule_type === 'weekly' && (
        <div className="field">
          <label>Days of week</label>
          <div className="weekday-picker">
            {WEEKDAY_LABELS.map((label, day) => (
              <button
                key={day}
                type="button"
                className="btn"
                aria-pressed={(form.days_of_week ?? []).includes(day)}
                onClick={() => toggleWeekday(day)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {form.schedule_type === 'custom' && (
        <div className="field">
          <label htmlFor="ws-date">Date</label>
          <input
            id="ws-date"
            type="date"
            value={form.schedule_date ?? ''}
            onChange={(e) => update('schedule_date', e.target.value)}
            required
          />
        </div>
      )}

      {form.schedule_type === 'interval' && (
        <div className="field">
          <label htmlFor="ws-interval">Every N days</label>
          <input
            id="ws-interval"
            type="number"
            min={1}
            value={form.interval_days ?? ''}
            onChange={(e) => update('interval_days', e.target.value === '' ? null : Number(e.target.value))}
            required
          />
        </div>
      )}

      <div className="field">
        <label htmlFor="ws-time">Time</label>
        <input id="ws-time" type="time" value={form.schedule_time} onChange={(e) => update('schedule_time', e.target.value)} required />
      </div>

      <div className="field">
        <label htmlFor="ws-notes">Notes</label>
        <textarea id="ws-notes" value={form.notes ?? ''} onChange={(e) => update('notes', e.target.value)} rows={2} />
      </div>

      <div className="field">
        <label>
          <input type="checkbox" checked={form.enabled} onChange={(e) => update('enabled', e.target.checked)} /> Reminders enabled
        </label>
      </div>

      <div className="field">
        <label>
          <input type="checkbox" checked={form.completed} onChange={(e) => update('completed', e.target.checked)} /> Completed
        </label>
        <span className="field__hint">Check this once the water change has actually happened.</span>
      </div>

      {form.completed && (
        <>
          <p className="field__hint water-params-hint">Water-quality readings (optional)</p>
          <div className="water-params-grid">
            <div className="field">
              <label htmlFor="ws-ph">pH</label>
              <input id="ws-ph" type="number" step="0.1" value={form.ph ?? ''} onChange={(e) => update('ph', e.target.value === '' ? null : Number(e.target.value))} />
            </div>
            <div className="field">
              <label htmlFor="ws-ammonia">Ammonia</label>
              <input
                id="ws-ammonia"
                type="number"
                step="0.01"
                value={form.ammonia ?? ''}
                onChange={(e) => update('ammonia', e.target.value === '' ? null : Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor="ws-nitrite">Nitrite</label>
              <input
                id="ws-nitrite"
                type="number"
                step="0.01"
                value={form.nitrite ?? ''}
                onChange={(e) => update('nitrite', e.target.value === '' ? null : Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor="ws-nitrate">Nitrate</label>
              <input
                id="ws-nitrate"
                type="number"
                step="0.1"
                value={form.nitrate ?? ''}
                onChange={(e) => update('nitrate', e.target.value === '' ? null : Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor="ws-tds">TDS</label>
              <input id="ws-tds" type="number" step="1" value={form.tds ?? ''} onChange={(e) => update('tds', e.target.value === '' ? null : Number(e.target.value))} />
            </div>
          </div>
        </>
      )}

      <div className="tab-section__actions tab-section__actions--spaced">
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          Save
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
