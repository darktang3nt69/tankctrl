import { useState } from 'react'
import type { WaterSchedule, WaterScheduleWrite } from '../../api/types'
import { useCreateWaterSchedule, useDeleteWaterSchedule, useUpdateWaterSchedule, useWaterSchedules } from '../../api/waterSchedules'
import { WaterScheduleForm } from './WaterScheduleForm'
import { WaterHistoryCalendar } from './WaterHistoryCalendar'
import { useToast } from '../../components/Toast'
import { EmptyState } from '../../components/EmptyState'
import { toLocalDateKey } from '../../lib/date'
import './tab-panels.css'

const BLANK: WaterScheduleWrite = {
  schedule_type: 'weekly',
  days_of_week: [],
  schedule_date: null,
  interval_days: null,
  schedule_time: '12:00',
  notes: null,
  completed: false,
  enabled: true,
  notify_24h: true,
  notify_1h: true,
  notify_on_time: true,
  ph: null,
  ammonia: null,
  nitrite: null,
  nitrate: null,
  tds: null,
}

function toWrite(s: WaterSchedule): WaterScheduleWrite {
  const { id: _id, device_id: _deviceId, created_at: _createdAt, updated_at: _updatedAt, ...rest } = s
  return rest
}

function cadenceLabel(s: WaterSchedule): string {
  if (s.schedule_type === 'custom') return s.schedule_date ?? 'one-off'
  if (s.schedule_type === 'interval') return `every ${s.interval_days} days`
  const days = (s.days_of_week ?? []).map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')
  return `weekly · ${days || '—'}`
}

export function WaterTab({ deviceId }: { deviceId: string }) {
  const { data: schedules, isLoading } = useWaterSchedules(deviceId)
  const createSchedule = useCreateWaterSchedule(deviceId)
  const updateSchedule = useUpdateWaterSchedule(deviceId)
  const deleteSchedule = useDeleteWaterSchedule(deviceId)
  const toast = useToast()

  const [mode, setMode] = useState<'none' | 'add' | 'log-now' | number>('none')

  function closeForm() {
    setMode('none')
  }

  if (isLoading) return <p>Loading water schedules…</p>

  const logNowDefaults: WaterScheduleWrite = {
    ...BLANK,
    schedule_type: 'custom',
    schedule_date: toLocalDateKey(new Date()),
    schedule_time: new Date().toTimeString().slice(0, 5),
    completed: true,
    enabled: false,
  }

  return (
    <div>
      <div className="tab-section__actions tab-section__actions--spaced">
        <button type="button" className="btn btn--primary" onClick={() => setMode('add')}>
          Add schedule
        </button>
        <button type="button" className="btn" onClick={() => setMode('log-now')}>
          Log a change now
        </button>
      </div>

      {mode === 'add' && (
        <WaterScheduleForm
          initial={BLANK}
          submitting={createSchedule.isPending}
          onCancel={closeForm}
          onSubmit={(body) =>
            createSchedule.mutate(body, {
              onSuccess: () => {
                toast.show('Water schedule created')
                closeForm()
              },
              onError: () => toast.show('Failed to create schedule', 'danger'),
            })
          }
        />
      )}

      {mode === 'log-now' && (
        <WaterScheduleForm
          initial={logNowDefaults}
          submitting={createSchedule.isPending}
          onCancel={closeForm}
          onSubmit={(body) =>
            createSchedule.mutate(body, {
              onSuccess: () => {
                toast.show('Water change logged')
                closeForm()
              },
              onError: () => toast.show('Failed to log water change', 'danger'),
            })
          }
        />
      )}

      {!schedules || schedules.length === 0 ? (
        <EmptyState title="No water schedules yet" description="Add a recurring schedule or log a change that just happened." />
      ) : (
        <div className="card tab-section-list">
          {schedules.map((s) =>
            mode === s.id ? (
              <WaterScheduleForm
                key={s.id}
                initial={toWrite(s)}
                submitting={updateSchedule.isPending}
                onCancel={closeForm}
                onSubmit={(body) =>
                  updateSchedule.mutate(
                    { scheduleId: s.id, body },
                    {
                      onSuccess: () => {
                        toast.show('Water schedule updated')
                        closeForm()
                      },
                      onError: () => toast.show('Failed to update schedule', 'danger'),
                    },
                  )
                }
              />
            ) : (
              <div key={s.id} className="tab-section__row">
                <div className="tab-section__row-main">
                  <span className="tab-section__row-title">{cadenceLabel(s)}</span>
                  <span className="tab-section__row-meta mono">
                    {s.schedule_time} · {s.completed ? 'completed' : s.enabled ? 'active' : 'disabled'}
                  </span>
                </div>
                <div className="tab-section__actions">
                  <button type="button" className="btn" onClick={() => setMode(s.id)}>
                    {s.completed ? 'Edit' : 'Mark complete / edit'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--danger"
                    onClick={() =>
                      deleteSchedule.mutate(s.id, {
                        onSuccess: () => toast.show('Schedule deleted'),
                        onError: () => toast.show('Failed to delete schedule', 'danger'),
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

      <div className="card">
        <h3 className="tab-section__title tab-section-list__title">History</h3>
        <WaterHistoryCalendar schedules={schedules ?? []} />
      </div>
    </div>
  )
}
