import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import type { Device } from '../api/types'
import { StatusPill, type PillTone } from './StatusPill'
import { Sparkline } from './Sparkline'
import { useSetLight } from '../api/commands'
import { useLiveSparkline } from '../features/overview/useLiveSparkline'
import { Button } from './ui/button'
import { Badge } from './ui/badge'

function statusTone(status: Device['status']): PillTone {
  if (status === 'online') return 'ok'
  if (status === 'time_unknown') return 'warn'
  return 'danger'
}

export function TankCard({ device, alertCount }: { device: Device; alertCount: number }) {
  const setLight = useSetLight(device.device_id)
  const sparklineData = useLiveSparkline(device.device_id)

  function handleSetLight(e: React.MouseEvent, state: 'on' | 'off') {
    e.preventDefault()
    e.stopPropagation()
    setLight.mutate(state, {
      onError: () => toast.error(`Couldn't set light for ${device.device_name ?? device.device_id}`),
    })
  }

  return (
    <Link
      to={`/tanks/${device.device_id}`}
      className="relative flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/50"
    >
      <div className="flex items-center justify-between">
        <span className="font-medium">{device.device_name ?? device.device_id}</span>
        <StatusPill tone={statusTone(device.status)} />
      </div>
      {sparklineData.length > 1 && (
        <div className="text-[var(--series-temp)]">
          <Sparkline data={sparklineData} color="var(--series-temp)" />
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={(e) => handleSetLight(e, 'on')} disabled={setLight.isPending}>
            Light on
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={(e) => handleSetLight(e, 'off')} disabled={setLight.isPending}>
            Light off
          </Button>
        </div>
        {alertCount > 0 && (
          <Badge variant="destructive" className="rounded-full px-2">
            {alertCount}
          </Badge>
        )}
      </div>
    </Link>
  )
}
