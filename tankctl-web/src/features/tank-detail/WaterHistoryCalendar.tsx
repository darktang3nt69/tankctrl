import { useMemo, useState } from 'react'
import { Calendar } from '../../components/ui/calendar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table'
import { EmptyState } from '../../components/EmptyState'
import type { WaterSchedule } from '../../api/types'
import { toLocalDateKey } from '../../lib/date'
import { waterQualityStatus } from '../../lib/waterQuality'
import { cn } from '../../lib/utils'

function cadenceLabel(s: WaterSchedule): string {
  if (s.schedule_type === 'custom') return s.schedule_date ?? 'one-off'
  if (s.schedule_type === 'interval') return `every ${s.interval_days} days`
  const days = (s.days_of_week ?? []).map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')
  return `weekly · ${days || '—'}`
}

const DOT_CLASS: Record<'ok' | 'warn' | 'danger', string> = {
  ok: 'bg-[var(--safe)]',
  warn: 'bg-[var(--warn)]',
  danger: 'bg-[var(--danger)]',
}

/** History covers completed one-off entries (logged) AND upcoming
 * enabled/uncompleted schedules (scheduled) — a completed weekly/interval
 * row is a recurring rule, not a dated historical event (see spec/PRODUCT.md),
 * so only its *upcoming* occurrences appear as "scheduled", never "logged". */
export function WaterHistoryCalendar({ schedules }: { schedules: WaterSchedule[] }) {
  const [month, setMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | undefined>()

  const completedByDate = useMemo(() => {
    const map = new Map<string, WaterSchedule[]>()
    for (const s of schedules) {
      if (s.schedule_type === 'custom' && s.completed && s.schedule_date) {
        const list = map.get(s.schedule_date) ?? []
        list.push(s)
        map.set(s.schedule_date, list)
      }
    }
    return map
  }, [schedules])

  const scheduledByDate = useMemo(() => {
    const map = new Map<string, WaterSchedule[]>()
    const add = (key: string, s: WaterSchedule) => {
      const list = map.get(key) ?? []
      list.push(s)
      map.set(key, list)
    }
    const monthStart = new Date(month.getFullYear(), month.getMonth(), 1)
    const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0)
    for (const s of schedules) {
      if (!s.enabled || s.completed) continue
      if (s.schedule_type === 'custom' && s.schedule_date) {
        add(s.schedule_date, s)
      } else if (s.schedule_type === 'weekly' && s.days_of_week) {
        for (const d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
          if (s.days_of_week.includes(d.getDay())) add(toLocalDateKey(d), s)
        }
      } else if (s.schedule_type === 'interval' && s.interval_days && s.created_at) {
        const anchorRaw = new Date(s.created_at)
        const anchor = new Date(anchorRaw.getFullYear(), anchorRaw.getMonth(), anchorRaw.getDate())
        for (const d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
          const diffDays = Math.round((d.getTime() - anchor.getTime()) / 86_400_000)
          if (diffDays >= 0 && diffDays % s.interval_days === 0) add(toLocalDateKey(d), s)
        }
      }
    }
    return map
  }, [schedules, month])

  const loggedDates = useMemo(
    () => [...completedByDate.keys()].map((k) => new Date(`${k}T00:00:00`)),
    [completedByDate],
  )
  const scheduledDates = useMemo(
    () => [...scheduledByDate.keys()].map((k) => new Date(`${k}T00:00:00`)),
    [scheduledByDate],
  )

  const selectedKey = selectedDate ? toLocalDateKey(selectedDate) : null
  const loggedEntries = selectedKey ? (completedByDate.get(selectedKey) ?? []) : []
  const scheduledEntries = selectedKey ? (scheduledByDate.get(selectedKey) ?? []) : []

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      {/* Left column: Calendar + legend */}
      <div className="flex flex-col gap-3 sm:w-[280px] sm:shrink-0">
        <Calendar
          mode="single"
          month={month}
          onMonthChange={setMonth}
          selected={selectedDate}
          onSelect={setSelectedDate}
          modifiers={{ logged: loggedDates, scheduled: scheduledDates }}
          modifiersClassNames={{
            logged:
              "relative after:absolute after:bottom-0.5 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-primary after:content-['']",
            scheduled:
              "relative before:absolute before:top-0.5 before:left-1/2 before:h-1 before:w-1 before:-translate-x-1/2 before:rounded-full before:border before:border-[var(--warn)] before:content-['']",
          }}
          className="rounded-md border p-2"
        />
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Logged
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full border border-[var(--warn)]" /> Scheduled
          </span>
        </div>
      </div>

      {/* Right column: Readings table or empty state */}
      <div className="flex-1">
        {selectedDate ? (
          <>
            {loggedEntries.length > 0 && (
              <div className="space-y-4">
                {loggedEntries.map((entry) => (
                  <div key={entry.id} className="rounded-lg border bg-card p-4">
                    {entry.notes && (
                      <div className="mb-3">
                        <p className="text-sm font-medium text-foreground">{entry.notes}</p>
                      </div>
                    )}
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Parameter</TableHead>
                          <TableHead>Value</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[
                          { key: 'ph' as const, label: 'pH', value: entry.ph },
                          { key: 'ammonia' as const, label: 'Ammonia', value: entry.ammonia },
                          { key: 'nitrite' as const, label: 'Nitrite', value: entry.nitrite },
                          { key: 'nitrate' as const, label: 'Nitrate', value: entry.nitrate },
                          { key: 'tds' as const, label: 'TDS', value: entry.tds },
                        ]
                          .filter(({ value }) => value !== null)
                          .map(({ key, label, value }) => {
                            const status = waterQualityStatus(key, value)
                            return (
                              <TableRow key={key}>
                                <TableCell className="font-medium">{label}</TableCell>
                                <TableCell>{value}</TableCell>
                                <TableCell>
                                  {status ? (
                                    <div className="flex items-center gap-1.5">
                                      <span className={cn('h-1.5 w-1.5 rounded-full', DOT_CLASS[status])} aria-hidden="true" />
                                      <span className="text-xs capitalize text-muted-foreground">{status === 'ok' ? 'safe' : status}</span>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                      </TableBody>
                    </Table>
                  </div>
                ))}
                {scheduledEntries.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">Upcoming schedules for this day:</p>
                    {scheduledEntries.map((s) => (
                      <div key={s.id} className="rounded-lg border bg-muted/50 p-3 text-sm">
                        <p className="font-medium">{cadenceLabel(s)}</p>
                        <p className="text-xs text-muted-foreground">{s.schedule_time}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {loggedEntries.length === 0 && scheduledEntries.length === 0 && (
              <EmptyState title="No data for this day" description="No water changes logged and no schedules planned." />
            )}
            {loggedEntries.length === 0 && scheduledEntries.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Scheduled for this day:</p>
                {scheduledEntries.map((s) => (
                  <div key={s.id} className="rounded-lg border bg-card p-3 text-sm">
                    <p className="font-medium">{cadenceLabel(s)}</p>
                    <p className="text-xs text-muted-foreground">{s.schedule_time}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <EmptyState title="Select a day" description="Click a date on the calendar to view water-quality readings and schedules." />
        )}
      </div>
    </div>
  )
}
