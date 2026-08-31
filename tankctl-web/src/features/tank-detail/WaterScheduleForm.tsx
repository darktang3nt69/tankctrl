import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { WaterScheduleWrite } from '../../api/types'
import { Button } from '../../components/ui/button'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '../../components/ui/form'
import { Input } from '../../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { Textarea } from '../../components/ui/textarea'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const waterScheduleSchema = z
  .object({
    schedule_type: z.enum(['weekly', 'custom', 'interval']),
    days_of_week: z.array(z.number().int().min(0).max(6)).nullable(),
    schedule_date: z.string().nullable(),
    interval_days: z.coerce.number().int().positive().nullable(),
    schedule_time: z.string().min(1, 'Time is required'),
    notes: z.string().nullable(),
    completed: z.boolean(),
    enabled: z.boolean(),
    notify_24h: z.boolean(),
    notify_1h: z.boolean(),
    notify_on_time: z.boolean(),
    ph: z.coerce.number().nullable(),
    ammonia: z.coerce.number().nullable(),
    nitrite: z.coerce.number().nullable(),
    nitrate: z.coerce.number().nullable(),
    tds: z.coerce.number().nullable(),
  })
  .refine((v) => v.schedule_type !== 'custom' || Boolean(v.schedule_date), {
    message: 'Date is required',
    path: ['schedule_date'],
  })
  .refine((v) => v.schedule_type !== 'interval' || (v.interval_days !== null && v.interval_days > 0), {
    message: 'Interval is required',
    path: ['interval_days'],
  })

type WaterScheduleFormValues = z.infer<typeof waterScheduleSchema>

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
  const form = useForm<WaterScheduleFormValues>({
    resolver: zodResolver(waterScheduleSchema),
    defaultValues: initial,
  })

  const scheduleType = form.watch('schedule_type')
  const daysOfWeek = form.watch('days_of_week') ?? []
  const completed = form.watch('completed')

  function toggleWeekday(day: number) {
    const next = daysOfWeek.includes(day) ? daysOfWeek.filter((d) => d !== day) : [...daysOfWeek, day].sort()
    form.setValue('days_of_week', next)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => onSubmit(values as WaterScheduleWrite))} className="space-y-4 rounded-lg border bg-muted/40 p-5">
        <FormField
          control={form.control}
          name="schedule_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cadence</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="weekly">Weekly (recurring)</SelectItem>
                  <SelectItem value="custom">One-off date</SelectItem>
                  <SelectItem value="interval">Every N days</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />

        {scheduleType === 'weekly' && (
          <FormItem>
            <FormLabel>Days of week</FormLabel>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_LABELS.map((label, day) => (
                <Button
                  key={day}
                  type="button"
                  variant={daysOfWeek.includes(day) ? 'default' : 'outline'}
                  size="sm"
                  aria-pressed={daysOfWeek.includes(day)}
                  onClick={() => toggleWeekday(day)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </FormItem>
        )}

        {scheduleType === 'custom' && (
          <FormField
            control={form.control}
            name="schedule_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date</FormLabel>
                <FormControl>
                  <Input type="date" value={field.value ?? ''} onChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {scheduleType === 'interval' && (
          <FormField
            control={form.control}
            name="interval_days"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Every N days</FormLabel>
                <FormControl>
                  <Input type="number" min={1} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="schedule_time"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Time</FormLabel>
              <FormControl>
                <Input type="time" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea rows={2} value={field.value ?? ''} onChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="enabled"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-2 space-y-0">
              <FormControl>
                <input type="checkbox" checked={field.value} onChange={(e) => field.onChange(e.target.checked)} className="h-4 w-4" />
              </FormControl>
              <FormLabel className="!mt-0">Reminders enabled</FormLabel>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="completed"
          render={({ field }) => (
            <FormItem>
              <div className="flex flex-row items-center gap-2">
                <FormControl>
                  <input type="checkbox" checked={field.value} onChange={(e) => field.onChange(e.target.checked)} className="h-4 w-4" />
                </FormControl>
                <FormLabel className="!mt-0">Completed</FormLabel>
              </div>
              <FormDescription>Check this once the water change has actually happened.</FormDescription>
            </FormItem>
          )}
        />

        {completed && (
          <>
            <p className="text-sm text-muted-foreground">Water-quality readings (optional)</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {(['ph', 'ammonia', 'nitrite', 'nitrate', 'tds'] as const).map((key) => (
                <FormField
                  key={key}
                  control={form.control}
                  name={key}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="capitalize">{key === 'ph' ? 'pH' : key === 'tds' ? 'TDS' : key}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step={key === 'ammonia' || key === 'nitrite' ? '0.01' : key === 'tds' ? '1' : '0.1'}
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              ))}
            </div>
          </>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={submitting}>
            Save
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  )
}
