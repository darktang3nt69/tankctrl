import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { CheckCircle2, Lightbulb, LightbulbOff } from 'lucide-react'
import type { LightSchedule } from '../../api/types'
import { useSetLight } from '../../api/commands'
import { useShadow } from '../../api/shadow'
import { useCommandAck } from '../shared/useCommandAck'
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
  const { data: shadow } = useShadow(deviceId)
  const { awaitCommand } = useCommandAck(deviceId)
  const [pending, setPending] = useState(false)
  const saveSchedule = useSaveLightSchedule(deviceId)
  const deleteSchedule = useDeleteLightSchedule(deviceId)
  const lightOn = shadow?.reported.light === 'on'

  const form = useForm<z.infer<typeof lightScheduleSchema>>({
    resolver: zodResolver(lightScheduleSchema),
    defaultValues: {
      on_time: lightSchedule?.on_time ?? '06:00',
      off_time: lightSchedule?.off_time ?? '18:00',
      enabled: lightSchedule?.enabled ?? true,
    },
  })

  function handleSetLight(state: 'on' | 'off') {
    setPending(true)
    setLight.mutate(state, {
      onError: () => {
        toast.error('Failed to set light')
        setPending(false)
      },
      onSuccess: async () => {
        const result = await awaitCommand('set_light', state)
        setPending(false)
        if (result === 'executed') {
          toast.success(`Light confirmed ${state}`, { icon: <CheckCircle2 className="size-4 text-[var(--safe)]" /> })
        } else if (result === 'failed') {
          toast.error(`Device reported it could not turn the light ${state}`)
        } else {
          toast.warning('Command sent, no confirmation yet')
        }
      },
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
          <Button
            type="button"
            variant={lightOn ? 'default' : 'outline'}
            onClick={() => handleSetLight('on')}
            disabled={setLight.isPending || pending}
            className="gap-1.5"
          >
            <Lightbulb className="size-4" />
            Turn on
          </Button>
          <Button
            type="button"
            variant={!lightOn && shadow ? 'default' : 'outline'}
            onClick={() => handleSetLight('off')}
            disabled={setLight.isPending || pending}
            className="gap-1.5"
          >
            <LightbulbOff className="size-4" />
            Turn off
          </Button>
          {pending && <span className="self-center text-xs text-muted-foreground">Waiting for device…</span>}
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
                    <Input type="time" {...field} className="max-w-[160px]" />
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
                    <Input type="time" {...field} className="max-w-[160px]" />
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
