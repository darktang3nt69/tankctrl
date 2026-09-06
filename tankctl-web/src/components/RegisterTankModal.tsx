import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRegisterDevice, useUpdateDeviceMetadata } from '../api/devices'
import { useCreateRelay, useRelayPresets } from '../api/relays'
import type { RelayType } from '../api/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { generateFirmware, downloadTextFile, type DeviceType } from '../lib/firmwareTemplate'

interface RelayRow {
  relay_name: string
  relay_type: RelayType
  gpio_pin: string
}

const DEVICE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/

function emptyRelayRow(): RelayRow {
  return { relay_name: '', relay_type: 'light', gpio_pin: '' }
}

export function RegisterTankModal() {
  const [open, setOpen] = useState(false)
  const [deviceType, setDeviceType] = useState<DeviceType>('esp32')
  const [deviceId, setDeviceId] = useState('')
  const [tankName, setTankName] = useState('')
  const [wifiSsid, setWifiSsid] = useState('')
  const [wifiPassword, setWifiPassword] = useState('')
  const [relayPin, setRelayPin] = useState('4')
  const [relayRows, setRelayRows] = useState<RelayRow[]>([emptyRelayRow()])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{
    deviceId: string
    mqttPassword: string
    firmware: { filename: string; content: string }
  } | null>(null)

  const registerDevice = useRegisterDevice()
  const updateMetadata = useUpdateDeviceMetadata(deviceId)
  const createRelay = useCreateRelay(deviceId)
  const { data: relayPresets } = useRelayPresets()

  function reset() {
    setDeviceType('esp32')
    setDeviceId('')
    setTankName('')
    setWifiSsid('')
    setWifiPassword('')
    setRelayPin('4')
    setRelayRows([emptyRelayRow()])
    setError(null)
    setResult(null)
  }

  function updateRelayRow(index: number, field: keyof RelayRow, value: string) {
    setRelayRows((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)))
  }

  function addRelayRow() {
    setRelayRows((rows) => [...rows, emptyRelayRow()])
  }

  function removeRelayRow(index: number) {
    setRelayRows((rows) => rows.filter((_, i) => i !== index))
  }

  function findRelayDuplicate(rows: RelayRow[]): string | null {
    const names = new Set<string>()
    const pins = new Set<string>()
    for (const row of rows) {
      if (!row.relay_name.trim()) continue
      if (names.has(row.relay_name.trim())) return `Relay name "${row.relay_name}" is used more than once`
      names.add(row.relay_name.trim())
      if (row.gpio_pin.trim()) {
        if (pins.has(row.gpio_pin.trim())) return `GPIO pin ${row.gpio_pin} is used more than once`
        pins.add(row.gpio_pin.trim())
      }
    }
    return null
  }

  async function handleSubmit() {
    setError(null)

    if (!DEVICE_ID_PATTERN.test(deviceId)) {
      setError('Device ID must be alphanumeric, underscore, or hyphen only')
      return
    }
    if (!wifiSsid.trim() || !wifiPassword.trim()) {
      setError('WiFi SSID and password are required to generate the firmware')
      return
    }
    const namedRelayRows = relayRows.filter((r) => r.relay_name.trim())
    if (deviceType === 'esp32') {
      const dup = findRelayDuplicate(namedRelayRows)
      if (dup) {
        setError(dup)
        return
      }
      for (const row of namedRelayRows) {
        if (!row.gpio_pin.trim() || Number.isNaN(Number(row.gpio_pin))) {
          setError(`Relay "${row.relay_name}" needs a valid GPIO pin`)
          return
        }
      }
    }

    setSubmitting(true)
    try {
      const registered = await registerDevice.mutateAsync({ device_id: deviceId, board_type: deviceType })

      if (tankName.trim()) {
        await updateMetadata.mutateAsync({ device_name: tankName.trim() })
      }

      if (deviceType === 'esp32') {
        for (const row of namedRelayRows) {
          await createRelay.mutateAsync({
            relay_name: row.relay_name.trim(),
            relay_type: row.relay_type,
            gpio_pin: Number(row.gpio_pin),
            active_level: 'LOW',
            default_state: 'off',
            fail_safe_default: 'off',
            cutoff_ceiling_seconds: null,
          })
        }
      }

      const firmware = await generateFirmware({
        deviceType,
        deviceId,
        wifiSsid: wifiSsid.trim(),
        wifiPassword: wifiPassword.trim(),
        mqttPassword: registered.mqtt_password,
        relayPin: deviceType === 'arduino_uno_r4' ? Number(relayPin) || 4 : undefined,
      })

      setResult({ deviceId, mqttPassword: registered.mqtt_password, firmware })
      toast.success(`${deviceId} registered`)
    } catch {
      setError('Registration failed — is the device ID already taken?')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          size="icon"
          aria-label="Register a new tank"
        >
          <Plus className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Register a tank</DialogTitle>
          <DialogDescription>
            {result
              ? 'Copy the credentials below and download the firmware for this device.'
              : 'Register a device by ID, optionally configure its relays, then download flash-ready firmware.'}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div role="alert" className="rounded-md border border-[var(--warn)] bg-[var(--warn-fill)] p-3">
              <p className="mb-2 text-sm font-medium">Copy this now — it will not be shown again.</p>
              <p className="font-mono text-sm">mqtt_password: {result.mqttPassword}</p>
            </div>
            <Button
              type="button"
              className="w-full"
              onClick={() => downloadTextFile(result.firmware.filename, result.firmware.content)}
            >
              Download {result.firmware.filename}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rt-device-id">Device ID</Label>
                <Input id="rt-device-id" placeholder="tank1" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rt-tank-name">Tank name (optional)</Label>
                <Input id="rt-tank-name" placeholder="Living room reef" value={tankName} onChange={(e) => setTankName(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Device type</Label>
              <Select value={deviceType} onValueChange={(v) => setDeviceType(v as DeviceType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="esp32">ESP32</SelectItem>
                  <SelectItem value="arduino_uno_r4">Arduino Uno R4 WiFi</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rt-wifi-ssid">WiFi SSID</Label>
                <Input id="rt-wifi-ssid" value={wifiSsid} onChange={(e) => setWifiSsid(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rt-wifi-password">WiFi password</Label>
                <Input id="rt-wifi-password" type="password" value={wifiPassword} onChange={(e) => setWifiPassword(e.target.value)} />
              </div>
            </div>

            {deviceType === 'esp32' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Relays</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addRelayRow}>
                    Add relay
                  </Button>
                </div>
                {relayPresets && (
                  <p className="text-xs text-muted-foreground">
                    Default relays — light: GPIO{relayPresets.presets.light.gpio_pin} · pump: GPIO{relayPresets.presets.pump.gpio_pin} · co2: GPIO{relayPresets.presets.co2.gpio_pin} · temp_sensor: GPIO{relayPresets.presets.temp_sensor.gpio_pin} · servo: GPIO{relayPresets.presets.servo.gpio_pin}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Created immediately so "Push config to device" works once this device boots — leave blank to skip.
                </p>
                <div className="space-y-2">
                  {relayRows.map((row, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        placeholder="light"
                        value={row.relay_name}
                        onChange={(e) => updateRelayRow(i, 'relay_name', e.target.value)}
                      />
                      <Select value={row.relay_type} onValueChange={(v) => {
                        updateRelayRow(i, 'relay_type', v)
                        if (relayPresets && relayPresets.presets[v as RelayType]) {
                          updateRelayRow(i, 'gpio_pin', String(relayPresets.presets[v as RelayType].gpio_pin))
                        }
                      }}>
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="light">light</SelectItem>
                          <SelectItem value="pump">pump</SelectItem>
                          <SelectItem value="co2">co2</SelectItem>
                          <SelectItem value="temp_sensor">temp_sensor</SelectItem>
                          <SelectItem value="servo">servo (PWM)</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={row.gpio_pin} onValueChange={(v) => updateRelayRow(i, 'gpio_pin', v)}>
                        <SelectTrigger className="w-24">
                          <SelectValue placeholder="GPIO" />
                        </SelectTrigger>
                        <SelectContent>
                          {relayPresets && relayPresets.safe_pins.esp32.map((pin) => (
                            <SelectItem key={pin} value={String(pin)}>
                              {pin}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeRelayRow(i)} aria-label="Remove relay">
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="rt-relay-pin">Relay pin</Label>
                <Select value={relayPin} onValueChange={setRelayPin}>
                  <SelectTrigger id="rt-relay-pin">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {relayPresets && relayPresets.safe_pins.arduino_uno_r4.map((pin) => (
                      <SelectItem key={pin} value={String(pin)}>
                        {pin}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  This firmware only supports one fixed relay, baked into the download.
                </p>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter>
          {!result && (
            <Button type="button" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Registering…' : 'Register & generate firmware'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
