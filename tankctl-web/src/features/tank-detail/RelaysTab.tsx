import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { CheckCircle2 } from 'lucide-react'
import type { RelayConfig, RelayConfigWrite, RelayType } from '../../api/types'
import { api } from '../../api/client'
import { useCreateRelay, useDeleteRelay, usePushRelayConfig, useRelayPresets, useRelays, useUpdateRelay } from '../../api/relays'
import { useSetDesiredState, useShadow } from '../../api/shadow'
import { useCommandAck } from '../shared/useCommandAck'
import { EmptyState } from '../../components/EmptyState'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '../../components/ui/form'
import { Input } from '../../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'

const relaySchema = z.object({
  relay_name: z.string().min(1, 'Relay name is required'),
  relay_type: z.enum(['light', 'pump', 'co2', 'temp_sensor', 'servo']),
  gpio_pin: z.coerce.number().int().min(0),
  active_level: z.enum(['LOW', 'HIGH']),
  default_state: z.enum(['on', 'off']),
  fail_safe_default: z.enum(['on', 'off']),
  cutoff_ceiling_seconds: z.coerce.number().int().positive().nullable(),
})

type RelayFormValues = z.infer<typeof relaySchema>

const EMPTY_FORM: RelayConfigWrite = {
  relay_name: '',
  relay_type: 'light',
  gpio_pin: 0,
  active_level: 'LOW',
  default_state: 'off',
  fail_safe_default: 'off',
  cutoff_ceiling_seconds: null,
}

function RelayForm({
  initial,
  lockName,
  existingRelays,
  safePins,
  presets,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial: RelayConfigWrite
  lockName: boolean
  existingRelays: [string, RelayConfig][]
  safePins: number[]
  presets: Record<RelayType, { gpio_pin: number; active_level: 'LOW' | 'HIGH'; pwm: boolean }> | null
  onSubmit: (body: RelayConfigWrite) => void
  onCancel: () => void
  submitting: boolean
}) {
  const form = useForm<RelayFormValues>({
    resolver: zodResolver(relaySchema),
    defaultValues: initial,
  })

  function handleSubmit(values: RelayFormValues) {
    const duplicateName = !lockName && existingRelays.some(([name]) => name === values.relay_name)
    if (duplicateName) {
      form.setError('relay_name', { message: 'A relay with this name already exists' })
      return
    }
    const duplicatePin = existingRelays.some(
      ([name, relay]) => name !== initial.relay_name && relay.gpio_pin === values.gpio_pin,
    )
    if (duplicatePin) {
      form.setError('gpio_pin', { message: 'This GPIO pin is already used by another relay' })
      return
    }
    onSubmit(values)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
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
          name="relay_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Relay type</FormLabel>
              <Select value={field.value} onValueChange={(value) => {
                field.onChange(value)
                if (presets && presets[value as RelayType]) {
                  const preset = presets[value as RelayType]
                  form.setValue('gpio_pin', preset.gpio_pin)
                  form.setValue('active_level', preset.active_level)
                }
              }}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="light">light</SelectItem>
                  <SelectItem value="pump">pump</SelectItem>
                  <SelectItem value="co2">co2</SelectItem>
                  <SelectItem value="temp_sensor">temp_sensor</SelectItem>
                  <SelectItem value="servo">servo (PWM, firmware pending)</SelectItem>
                </SelectContent>
              </Select>
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
              <Select value={String(field.value)} onValueChange={(value) => field.onChange(Number(value))}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {safePins.map((pin) => (
                    <SelectItem key={pin} value={String(pin)}>
                      GPIO {pin}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                {presets && `Defaults — light: GPIO${presets.light.gpio_pin} · pump: GPIO${presets.pump.gpio_pin} · co2: GPIO${presets.co2.gpio_pin} · temp_sensor: GPIO${presets.temp_sensor.gpio_pin} · servo: GPIO${presets.servo.gpio_pin}`}
              </FormDescription>
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

export function RelaysTab({ deviceId, boardType }: { deviceId: string; boardType: 'esp32' | 'arduino_uno_r4' }) {
  const { data: relayConfig, isLoading } = useRelays(deviceId)
  const { data: shadow } = useShadow(deviceId)
  const { data: relayPresets } = useRelayPresets()
  const createRelay = useCreateRelay(deviceId)
  const updateRelay = useUpdateRelay(deviceId)
  const deleteRelay = useDeleteRelay(deviceId)
  const pushConfig = usePushRelayConfig(deviceId)
  const setDesired = useSetDesiredState(deviceId)
  const { awaitCommand } = useCommandAck(deviceId)

  const [addOpen, setAddOpen] = useState(false)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [pendingRelay, setPendingRelay] = useState<string | null>(null)
  const [confirmDeleteName, setConfirmDeleteName] = useState<string | null>(null)
  const [pushing, setPushing] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkConfirm, setBulkConfirm] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const relays: [string, RelayConfig][] = relayConfig ? Object.entries(relayConfig.relays) : []

  function toggleSelected(name: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  async function handleBulkDelete() {
    const names = [...selected]
    setBulkDeleting(true)
    const results = await Promise.allSettled(names.map((name) => deleteRelay.mutateAsync(name)))
    setBulkDeleting(false)
    setBulkConfirm(false)
    setSelected(new Set())
    const failed = results.filter((r) => r.status === 'rejected').length
    if (failed === 0) {
      toast.success(`${names.length} relay${names.length === 1 ? '' : 's'} deleted`)
    } else {
      toast.error(`Deleted ${names.length - failed} of ${names.length} relays — ${failed} failed`)
    }
  }

  async function toggleRelay(name: string, state: 'on' | 'off') {
    setPendingRelay(name)
    setDesired.mutate(
      { [name]: state },
      {
        onError: () => {
          toast.error(`Failed to send command to ${name}`)
          setPendingRelay(null)
        },
        onSuccess: async () => {
          const result = await awaitCommand(`set_${name}`, state)
          setPendingRelay(null)
          if (result === 'executed') {
            toast.success(`${name} confirmed ${state}`, { icon: <CheckCircle2 className="size-4 text-[var(--safe)]" /> })
          } else if (result === 'failed') {
            toast.error(`${name} reported it could not switch ${state}`)
          } else {
            toast.warning(`${name}: command sent, no confirmation yet`)
          }
        },
      },
    )
  }

  async function handlePushConfig() {
    setPushing(true)
    pushConfig.mutate(undefined, {
      onError: () => {
        toast.error('Failed to push config')
        setPushing(false)
      },
      onSuccess: async () => {
        const pushedNames = relays.map(([name]) => name)
        const confirmed = await waitForRelaySet(deviceId, pushedNames)
        setPushing(false)
        if (confirmed) {
          toast.success('Relay config live on device', { icon: <CheckCircle2 className="size-4 text-[var(--safe)]" /> })
        } else {
          toast.warning('Config pushed — waiting on device confirmation')
        }
      },
    })
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading relays…</p>

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button type="button">Add relay</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add relay</DialogTitle>
            </DialogHeader>
            <RelayForm
              initial={EMPTY_FORM}
              lockName={false}
              existingRelays={relays}
              safePins={relayPresets?.safe_pins[boardType] ?? []}
              presets={relayPresets?.presets ?? null}
              submitting={createRelay.isPending}
              onCancel={() => setAddOpen(false)}
              onSubmit={(body) =>
                createRelay.mutate(body, {
                  onSuccess: () => {
                    toast.success('Relay created')
                    setAddOpen(false)
                  },
                  onError: () => toast.error('Failed to create relay'),
                })
              }
            />
          </DialogContent>
        </Dialog>
        <Button type="button" variant="outline" disabled={pushing} onClick={handlePushConfig}>
          {pushing ? 'Pushing…' : 'Push config to device'}
        </Button>
        {selected.size > 0 && (
          <div className="flex flex-1 flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <div className="ml-auto flex items-center gap-2">
              {bulkConfirm ? (
                <>
                  <span className="text-xs text-muted-foreground">Delete {selected.size} relays?</span>
                  <Button type="button" variant="destructive" size="sm" disabled={bulkDeleting} onClick={handleBulkDelete}>
                    Confirm delete
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setBulkConfirm(false)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button type="button" variant="destructive" size="sm" onClick={() => setBulkConfirm(true)}>
                  Delete selected
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {relays.length === 0 ? (
        <EmptyState title="No relays configured" description="Add a relay to control it from here." />
      ) : (
        <>
          <div className="space-y-3 rounded-lg border bg-card p-2">
          {relays.map(([name, relay]) =>
            editingName === name ? (
              <Dialog key={name} open onOpenChange={(open) => !open && setEditingName(null)}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit {name}</DialogTitle>
                  </DialogHeader>
                  <RelayForm
                    initial={{ ...relay, relay_name: name }}
                    lockName
                    existingRelays={relays}
                    safePins={relayPresets?.safe_pins[boardType] ?? []}
                    presets={relayPresets?.presets ?? null}
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
                </DialogContent>
              </Dialog>
            ) : null,
          )}
          {relays.map(([name, relay]) => {
            const reportedState = shadow?.reported[name]
            const isOn = reportedState === 'on'
            return (
              <div key={name} className={`flex flex-wrap items-center justify-between gap-3 rounded-md px-3 py-3.5 hover:bg-muted/40 transition-opacity ${confirmDeleteName === name ? 'opacity-50 hover:bg-transparent' : ''}`}>
                <div className="flex items-center gap-3">
                  {confirmDeleteName !== name && (
                    <input
                      type="checkbox"
                      className="size-4 shrink-0 cursor-pointer accent-[var(--primary)]"
                      checked={selected.has(name)}
                      onChange={() => toggleSelected(name)}
                      aria-label={`Select ${name}`}
                    />
                  )}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{name}</span>
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {relay.relay_type}
                      </Badge>
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">
                      GPIO {relay.gpio_pin} {pendingRelay === name && '· sending…'}
                    </span>
                  </div>
                </div>
                {confirmDeleteName === name ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Delete {name}?</span>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={deleteRelay.isPending}
                      onClick={() =>
                        deleteRelay.mutate(name, {
                          onSuccess: () => {
                            toast.success('Relay deleted')
                            setSelected((prev) => {
                              if (!prev.has(name)) return prev
                              const next = new Set(prev)
                              next.delete(name)
                              return next
                            })
                          },
                          onError: () => toast.error('Failed to delete relay'),
                          onSettled: () => setConfirmDeleteName(null),
                        })
                      }
                    >
                      Confirm delete
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDeleteName(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={isOn ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleRelay(name, 'on')}
                      disabled={setDesired.isPending || pendingRelay === name}
                    >
                      On
                    </Button>
                    <Button
                      type="button"
                      variant={!isOn && reportedState !== undefined ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleRelay(name, 'off')}
                      disabled={setDesired.isPending || pendingRelay === name}
                    >
                      Off
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditingName(name)}>
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => setConfirmDeleteName(name)}
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
          </div>
        </>
      )}
    </div>
  )
}

/** Polls the device shadow until its reported state includes every relay
 * name just pushed, or gives up after ~10s. Pushing config has no dedicated
 * backend ack event (the MQTT publish is fire-and-forget), so this is the
 * closest real signal available without a backend change: the device only
 * reports a relay name once it has applied that relay's new definition. */
async function waitForRelaySet(deviceId: string, names: string[], timeoutMs = 10_000): Promise<boolean> {
  if (names.length === 0) return true
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const shadow = await api.get<{ reported: Record<string, string> }>(`/devices/${deviceId}/shadow`)
      if (names.every((n) => n in shadow.reported)) return true
    } catch {
      // transient — keep polling until the timeout
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
  return false
}
