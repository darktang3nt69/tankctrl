import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Lightbulb } from 'lucide-react'
import { motion } from 'motion/react'
import type { Device } from '../api/types'
import { StatusPill, type PillTone } from './StatusPill'
import { Sparkline } from './Sparkline'
import { useSetLight } from '../api/commands'
import { useShadow } from '../api/shadow'
import { useLiveSparkline } from '../features/overview/useLiveSparkline'
import { Badge } from './ui/badge'
import { StatusIcon } from './ui/status-icon'

function statusTone(status: Device['status']): PillTone {
  if (status === 'online') return 'ok'
  if (status === 'time_unknown') return 'warn'
  return 'danger'
}

export function TankCard({ device, alertCount }: { device: Device; alertCount: number }) {
  const setLight = useSetLight(device.device_id)
  const { data: shadow } = useShadow(device.device_id)
  const sparklineData = useLiveSparkline(device.device_id)
  const lightOn = shadow?.reported.light === 'on'
  const lastValue = sparklineData.at(-1)?.value

  function handleToggleLight(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const next = lightOn ? 'off' : 'on'
    setLight.mutate(next, {
      onError: () => toast.error(`Couldn't set light for ${device.device_name ?? device.device_id}`),
    })
  }

  return (
    <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}>
      <Link
        to={`/tanks/${device.device_id}`}
        className="tank-card relative flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/50 hover:shadow-[0_0_18px_-4px_var(--series-tank-purple)]"
      >
        <div className="flex items-center justify-between">
          <span className="font-medium">{device.device_name ?? device.device_id}</span>
          <StatusPill tone={statusTone(device.status)} />
        </div>
        {sparklineData.length > 1 && (
          <div className="flex items-center justify-between gap-2">
            <Sparkline data={sparklineData} color="var(--series-tank-purple)" />
            {lastValue !== undefined && (
              <span className="font-mono text-sm font-medium text-[var(--series-tank-purple)]">
                {lastValue.toFixed(1)}°C
              </span>
            )}
          </div>
        )}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleToggleLight}
            disabled={setLight.isPending}
            className="cursor-pointer rounded-full disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={lightOn ? 'Turn light off' : 'Turn light on'}
          >
            <StatusIcon icon={Lightbulb} state={lightOn ? 'on' : 'off'} className="size-8" />
          </button>
          {alertCount > 0 && (
            <Badge variant="destructive" className="rounded-full px-2">
              {alertCount}
            </Badge>
          )}
        </div>
      </Link>
    </motion.div>
  )
}
