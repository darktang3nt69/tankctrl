import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import type { RelayConfig, RelayConfigWrite } from '../../api/types'
import { useCreateRelay, useDeleteRelay, usePushRelayConfig, useRelays, useUpdateRelay } from '../../api/relays'
import { useSetDesiredState, useShadow } from '../../api/shadow'
import { EmptyState } from '../../components/EmptyState'
import { Button } from '../../components/ui/button'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '../../components/ui/form'
import { Input } from '../../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'

const relaySchema = z.object({
  relay_name: z.string().min(1, 'Relay name is required'),
  gpio_pin: z.coerce.number().int().min(0).max(39),
  active_level: z.enum(['LOW', 'HIGH']),
  default_state: z.enum(['on', 'off']),
  fail_safe_default: z.enum(['on', 'off']),
  cutoff_ceiling_seconds: z.coerce.number().int().positive().nullable(),
})

type RelayFormValues = z.infer<typeof relaySchema>

const EMPTY_FORM: RelayConfigWrite = {
  relay_name: '',
  gpio_pin: 0,
  active_level: 'LOW',
  default_state: 'off',
  fail_safe_default: 'off',
  cutoff_ceiling_seconds: null,
}

function RelayForm({
  initial,
  lockName,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial: RelayConfigWrite
  lockName: boolean
  onSubmit: (body: RelayConfigWrite) => void
  onCancel: () => void
  submitting: boolean
}) {
  const form = useForm<RelayFormValues>({
    resolver: zodResolver(relaySchema),
    defaultValues: initial,
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 rounded-lg border bg-muted/40 p-5">
        <FormField
          control={form.control}
          name="relay_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Relay name</FormLabel>
              <FormControl>
                <Input {...field} disabled={lockName} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="gpio_pin"
          render={({ field }) => (
            <FormItem>
              <FormLabel>GPIO pin</FormLabel>
              <FormControl>
                <Input type="number" min={0} max={39} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="active_level"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Active level</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="LOW">LOW</SelectItem>
                  <SelectItem value="HIGH">HIGH</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="default_state"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Default state (on boot)</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="off">off</SelectItem>
                  <SelectItem value="on">on</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="fail_safe_default"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fail-safe default</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="off">off</SelectItem>
                  <SelectItem value="on">on</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>State forced when the device can't trust its network/time.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="cutoff_ceiling_seconds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cutoff ceiling (seconds, blank = no ceiling)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={submitting}>
            Save relay
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  )
}

export function RelaysTab({ deviceId }: { deviceId: string }) {
  const { data: relayConfig, isLoading } = useRelays(deviceId)
  const { data: shadow } = useShadow(deviceId)
  const createRelay = useCreateRelay(deviceId)
  const updateRelay = useUpdateRelay(deviceId)
  const deleteRelay = useDeleteRelay(deviceId)
  const pushConfig = usePushRelayConfig(deviceId)
  const setDesired = useSetDesiredState(deviceId)

  const [adding, setAdding] = useState(false)
  const [editingName, setEditingName] = useState<string | null>(null)

  const relays: [string, RelayConfig][] = relayConfig ? Object.entries(relayConfig.relays) : []

  function toggleRelay(name: string, state: 'on' | 'off') {
    setDesired.mutate(
      { [name]: state },
      {
        onSuccess: () => toast.success(`${name} set to ${state}`),
        onError: () => toast.error(`Failed to set ${name}`),
      },
    )
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading relays…</p>

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button type="button" onClick={() => setAdding(true)}>
          Add relay
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pushConfig.isPending}
          onClick={() =>
            pushConfig.mutate(undefined, {
              onSuccess: () => toast.success('Relay config pushed to device'),
              onError: () => toast.error('Failed to push config'),
            })
          }
        >
          Push config to device
        </Button>
      </div>

      {adding && (
        <RelayForm
          initial={EMPTY_FORM}
          lockName={false}
          submitting={createRelay.isPending}
          onCancel={() => setAdding(false)}
          onSubmit={(body) =>
            createRelay.mutate(body, {
              onSuccess: () => {
                toast.success('Relay created')
                setAdding(false)
              },
              onError: () => toast.error('Failed to create relay'),
            })
          }
        />
      )}

      {relays.length === 0 && !adding ? (
        <EmptyState title="No relays configured" description="Add a relay to control it from here." />
      ) : (
        <div className="divide-y rounded-lg border bg-card">
          {relays.map(([name, relay]) =>
            editingName === name ? (
              <div key={name} className="p-4">
                <RelayForm
                  initial={{ ...relay, relay_name: name }}
                  lockName
                  submitting={updateRelay.isPending}
                  onCancel={() => setEditingName(null)}
                  onSubmit={(body) =>
                    updateRelay.mutate(
                      { relayName: name, body },
                      {
                        onSuccess: () => {
                          toast.success('Relay updated')
                          setEditingName(null)
                        },
                        onError: () => toast.error('Failed to update relay'),
                      },
                    )
                  }
                />
              </div>
            ) : (
              <div key={name} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    GPIO {relay.gpio_pin} · reported: {shadow?.reported[name] ?? 'unknown'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => toggleRelay(name, 'on')} disabled={setDesired.isPending}>
                    On
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => toggleRelay(name, 'off')} disabled={setDesired.isPending}>
                    Off
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditingName(name)}>
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() =>
                      deleteRelay.mutate(name, {
                        onSuccess: () => toast.success('Relay deleted'),
                        onError: () => toast.error('Failed to delete relay'),
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
    </div>
  )
}
