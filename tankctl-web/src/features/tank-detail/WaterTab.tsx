import { useState } from 'react'
import { toast } from 'sonner'
import type { WaterSchedule, WaterScheduleWrite } from '../../api/types'
import { useCreateWaterSchedule, useDeleteWaterSchedule, useUpdateWaterSchedule, useWaterSchedules } from '../../api/waterSchedules'
import { WaterScheduleForm } from './WaterScheduleForm'
import { WaterHistoryCalendar } from './WaterHistoryCalendar'
import { EmptyState } from '../../components/EmptyState'
import { Button } from '../../components/ui/button'
import { toLocalDateKey } from '../../lib/date'

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

  const [mode, setMode] = useState<'none' | 'add' | 'log-now' | number>('none')

  function closeForm() {
    setMode('none')
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading water schedules…</p>

  const logNowDefaults: WaterScheduleWrite = {
    ...BLANK,
    schedule_type: 'custom',
    schedule_date: toLocalDateKey(new Date()),
    schedule_time: new Date().toTimeString().slice(0, 5),
    completed: true,
    enabled: false,
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button type="button" onClick={() => setMode('add')}>
          Add schedule
        </Button>
        <Button type="button" variant="outline" onClick={() => setMode('log-now')}>
          Log a change now
        </Button>
      </div>

      {mode === 'add' && (
        <WaterScheduleForm
          initial={BLANK}
          submitting={createSchedule.isPending}
          onCancel={closeForm}
          onSubmit={(body) =>
            createSchedule.mutate(body, {
              onSuccess: () => {
                toast.success('Water schedule created')
                closeForm()
              },
              onError: () => toast.error('Failed to create schedule'),
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
                toast.success('Water change logged')
                closeForm()
              },
              onError: () => toast.error('Failed to log water change'),
            })
          }
        />
      )}

      {!schedules || schedules.length === 0 ? (
        <EmptyState title="No water schedules yet" description="Add a recurring schedule or log a change that just happened." />
      ) : (
        <div className="divide-y rounded-lg border bg-card">
          {schedules.map((s) =>
            mode === s.id ? (
              <div key={s.id} className="p-4">
                <WaterScheduleForm
                  initial={toWrite(s)}
                  submitting={updateSchedule.isPending}
                  onCancel={closeForm}
                  onSubmit={(body) =>
                    updateSchedule.mutate(
                      { scheduleId: s.id, body },
                      {
                        onSuccess: () => {
                          toast.success('Water schedule updated')
                          closeForm()
                        },
                        onError: () => toast.error('Failed to update schedule'),
                      },
                    )
                  }
                />
              </div>
            ) : (
              <div key={s.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{cadenceLabel(s)}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {s.schedule_time} · {s.completed ? 'completed' : s.enabled ? 'active' : 'disabled'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setMode(s.id)}>
                    {s.completed ? 'Edit' : 'Mark complete / edit'}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() =>
                      deleteSchedule.mutate(s.id, {
                        onSuccess: () => toast.success('Schedule deleted'),
                        onError: () => toast.error('Failed to delete schedule'),
                      })
                    }
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ),
          )}
        </div>
      )}

      <div className="rounded-lg border bg-card p-5">
        <h3 className="mb-3 font-semibold">History</h3>
        <WaterHistoryCalendar schedules={schedules ?? []} />
      </div>
    </div>
  )
}
