import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import type { LightSchedule } from '../../api/types'
import { useSetLight } from '../../api/commands'
import { useSaveLightSchedule, useDeleteLightSchedule } from '../../api/lightSchedule'
import { Button } from '../../components/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../../components/ui/form'
import { Input } from '../../components/ui/input'

const lightScheduleSchema = z.object({
  on_time: z.string().min(1, 'On time is required'),
  off_time: z.string().min(1, 'Off time is required'),
  enabled: z.boolean(),
})

/** Mounted with `key={deviceId}` by TankDetail, so switching tanks remounts
 * this component fresh rather than needing an effect to resync form state. */
export function LightTab({ deviceId, lightSchedule }: { deviceId: string; lightSchedule: LightSchedule | null }) {
  const setLight = useSetLight(deviceId)
  const saveSchedule = useSaveLightSchedule(deviceId)
  const deleteSchedule = useDeleteLightSchedule(deviceId)

  const form = useForm<z.infer<typeof lightScheduleSchema>>({
    resolver: zodResolver(lightScheduleSchema),
    defaultValues: {
      on_time: lightSchedule?.on_time ?? '06:00',
      off_time: lightSchedule?.off_time ?? '18:00',
      enabled: lightSchedule?.enabled ?? true,
    },
  })

  function handleSetLight(state: 'on' | 'off') {
    setLight.mutate(state, {
      onSuccess: () => toast.success(`Light turned ${state}`),
      onError: () => toast.error('Failed to set light'),
    })
  }

  function onSubmit(values: z.infer<typeof lightScheduleSchema>) {
    saveSchedule.mutate(values, {
      onSuccess: () => toast.success('Light schedule saved'),
      onError: () => toast.error('Failed to save schedule'),
    })
  }

  function handleDeleteSchedule() {
    deleteSchedule.mutate(undefined, {
      onSuccess: () => toast.success('Light schedule deleted'),
      onError: () => toast.error('Failed to delete schedule'),
    })
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-card p-5">
        <h3 className="mb-3 font-semibold">Manual override</h3>
        <div className="flex gap-2">
          <Button type="button" onClick={() => handleSetLight('on')} disabled={setLight.isPending}>
            Turn on
          </Button>
          <Button type="button" variant="outline" onClick={() => handleSetLight('off')} disabled={setLight.isPending}>
            Turn off
          </Button>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-5">
        <h3 className="mb-4 font-semibold">Schedule</h3>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="on_time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>On time</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="off_time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Off time</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
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
                  <FormLabel className="!mt-0">Enabled</FormLabel>
                </FormItem>
              )}
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={saveSchedule.isPending}>
                Save schedule
              </Button>
              {lightSchedule && (
                <Button type="button" variant="destructive" onClick={handleDeleteSchedule} disabled={deleteSchedule.isPending}>
                  Delete schedule
                </Button>
              )}
            </div>
          </form>
        </Form>
      </section>
    </div>
  )
}
