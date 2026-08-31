import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useDevices, useRegisterDevice } from '../api/devices'
import { Button } from '../components/ui/button'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '../components/ui/form'
import { Input } from '../components/ui/input'

const registerSchema = z.object({
  deviceId: z
    .string()
    .min(1, 'Device ID is required')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Alphanumeric, underscore, hyphen only'),
})

export function Settings() {
  const { data: devices } = useDevices()
  const registerDevice = useRegisterDevice()
  const [secret, setSecret] = useState<{ device_secret: string; mqtt_password: string } | null>(null)

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { deviceId: '' },
  })

  function onSubmit(values: z.infer<typeof registerSchema>) {
    registerDevice.mutate(values.deviceId, {
      onSuccess: (res) => {
        setSecret({ device_secret: res.device_secret, mqtt_password: res.mqtt_password })
        form.reset()
      },
      onError: () => toast.error("Failed to register device — is the id already taken?"),
    })
  }

  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold tracking-tight">Settings</h1>

      <section className="mb-6 rounded-lg border bg-card p-5">
        <h3 className="mb-4 font-semibold">Register a device</h3>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="deviceId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Device ID</FormLabel>
                  <FormControl>
                    <Input placeholder="tank1" {...field} />
                  </FormControl>
                  <FormDescription>Alphanumeric, underscore, hyphen only.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={registerDevice.isPending}>
              Register
            </Button>
          </form>
        </Form>

        {secret && (
          <div role="alert" className="mt-4 rounded-md border border-[var(--warn)] bg-[var(--warn-fill)] p-3">
            <p className="mb-2 text-sm font-medium">Copy these now — they will not be shown again.</p>
            <p className="font-mono text-sm">device_secret: {secret.device_secret}</p>
            <p className="font-mono text-sm">mqtt_password: {secret.mqtt_password}</p>
          </div>
        )}
      </section>

      <section className="rounded-lg border bg-card p-5">
        <h3 className="mb-4 font-semibold">Devices</h3>
        {(devices ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No devices registered yet.</p>
        ) : (
          <ul className="divide-y">
            {(devices ?? []).map((d) => (
              <li key={d.device_id} className="flex items-center justify-between gap-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{d.device_name ?? d.device_id}</span>
                  <span className="font-mono text-xs text-muted-foreground">{d.device_id}</span>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link to={`/tanks/${d.device_id}?tab=relays`}>Configure relays</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
