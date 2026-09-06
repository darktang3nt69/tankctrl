import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Wifi, WifiOff } from 'lucide-react'
import { useDevices } from '../api/devices'
import { Button } from '../components/ui/button'
import { Label } from '../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { StatusIcon } from '../components/ui/status-icon'
import { getTimezone, setTimezone, getAccentColor, setAccentColor, DEFAULT_ACCENT } from '../lib/preferences'

const ACCENT_PRESETS = [
  { label: 'Amber', hex: DEFAULT_ACCENT },
  { label: 'Purple', hex: '#9333ea' },
  { label: 'Blue', hex: '#2563eb' },
  { label: 'Green', hex: '#16a34a' },
  { label: 'Rose', hex: '#e11d48' },
]

const TIMEZONES = (() => {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return [Intl.DateTimeFormat().resolvedOptions().timeZone]
  }
})()

export function Settings() {
  const { data: devices } = useDevices()
  const [timezone, setTimezoneState] = useState(getTimezone)
  const [accent, setAccentState] = useState(getAccentColor)

  function handleTimezoneChange(tz: string) {
    setTimezone(tz)
    setTimezoneState(tz)
  }

  function handleAccentChange(hex: string) {
    setAccentColor(hex)
    setAccentState(hex)
  }

  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold tracking-tight">Settings</h1>

      <section className="mb-6 rounded-lg border bg-card p-5">
        <h3 className="mb-4 font-semibold">Appearance & locale</h3>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="settings-timezone">Timezone</Label>
            <Select value={timezone} onValueChange={handleTimezoneChange}>
              <SelectTrigger id="settings-timezone" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Used to format dates and times throughout the app.</p>
          </div>

          <div className="space-y-1.5">
            <Label>Accent color</Label>
            <div className="flex flex-wrap items-center gap-2">
              {ACCENT_PRESETS.map((preset) => (
                <button
                  key={preset.hex}
                  type="button"
                  aria-label={preset.label}
                  aria-pressed={accent === preset.hex}
                  onClick={() => handleAccentChange(preset.hex)}
                  className="size-7 rounded-full border-2 cursor-pointer transition-transform hover:scale-110"
                  style={{ backgroundColor: preset.hex, borderColor: accent === preset.hex ? 'var(--foreground)' : 'transparent' }}
                />
              ))}
              <input
                type="color"
                aria-label="Custom accent color"
                value={accent}
                onChange={(e) => handleAccentChange(e.target.value)}
                className="size-7 cursor-pointer rounded-full border-none bg-transparent p-0"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-5">
        <h3 className="mb-4 font-semibold">Devices</h3>
        {(devices ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No devices registered yet — use the + button to add one.</p>
        ) : (
          <ul className="divide-y">
            {(devices ?? []).map((d) => (
              <li key={d.device_id} className="flex items-center gap-4 rounded-md px-3 py-3 transition-colors hover:bg-muted/40">
                <StatusIcon
                  icon={d.status === 'online' ? Wifi : WifiOff}
                  state={d.status === 'online' ? 'online' : 'offline'}
                  className="size-8 shrink-0"
                />
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{d.device_name ?? d.device_id}</span>
                  <span className="font-mono text-xs text-muted-foreground">{d.device_id}</span>
                </div>
                <Button asChild variant="outline" size="sm" className="ml-auto">
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
