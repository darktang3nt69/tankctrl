import { useMemo, useState } from 'react'
import type { WaterSchedule } from '../../api/types'
import { toLocalDateKey } from '../../lib/date'
import './WaterHistoryCalendar.css'

/** History is completed one-off entries only — a completed weekly/interval row
 * is a recurring rule, not a dated historical event (see spec/PRODUCT.md). */
export function WaterHistoryCalendar({ schedules }: { schedules: WaterSchedule[] }) {
  const [monthOffset, setMonthOffset] = useState(0)

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

  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const viewDate = new Date()
  viewDate.setMonth(viewDate.getMonth() + monthOffset)
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startWeekday = firstDay.getDay()

  const cells: (Date | null)[] = [
    ...Array.from({ length: startWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ]

  const selectedEntries = selectedDate ? (completedByDate.get(selectedDate) ?? []) : []

  return (
    <div className="water-calendar">
      <div className="water-calendar__nav">
        <button type="button" className="btn" onClick={() => setMonthOffset((m) => m - 1)}>
          ‹
        </button>
        <span className="water-calendar__month">{viewDate.toLocaleDateString([], { month: 'long', year: 'numeric' })}</span>
        <button type="button" className="btn" onClick={() => setMonthOffset((m) => m + 1)}>
          ›
        </button>
      </div>
      <div className="water-calendar__grid">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
          <div key={d} className="water-calendar__weekday">
            {d}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={i} className="water-calendar__cell water-calendar__cell--empty" />
          const key = toLocalDateKey(date)
          const hasEntry = completedByDate.has(key)
          return (
            <button
              key={i}
              type="button"
              className={`water-calendar__cell ${hasEntry ? 'water-calendar__cell--marked' : ''} ${selectedDate === key ? 'water-calendar__cell--selected' : ''}`}
              onClick={() => setSelectedDate(hasEntry ? key : null)}
            >
              {date.getDate()}
            </button>
          )
        })}
      </div>
      {selectedEntries.length > 0 && (
        <div className="water-calendar__detail">
          {selectedEntries.map((entry) => (
            <div key={entry.id} className="water-calendar__entry">
              <p className="mono water-calendar__entry-date">{entry.schedule_date}</p>
              {entry.notes && <p>{entry.notes}</p>}
              <p className="mono water-calendar__entry-params">
                {[
                  entry.ph !== null && `pH ${entry.ph}`,
                  entry.ammonia !== null && `NH3 ${entry.ammonia}`,
                  entry.nitrite !== null && `NO2 ${entry.nitrite}`,
                  entry.nitrate !== null && `NO3 ${entry.nitrate}`,
                  entry.tds !== null && `TDS ${entry.tds}`,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'No readings recorded'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
