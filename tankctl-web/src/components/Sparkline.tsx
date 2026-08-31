import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

export interface SparklineDatum {
  t: Date
  value: number
}

/** Glance-level trend indicator for TankCard, now WS-live: dots mark every
 * point, the latest pulses. Still not the accessible chart (that's
 * LineChart on Tank Detail) — decorative but interactive on hover. */
export function Sparkline({ data, color }: { data: SparklineDatum[]; color: string }) {
  if (data.length < 2) return null

  const width = 120
  const height = 32
  const values = data.map((d) => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const coords = data.map((d, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - ((d.value - min) / range) * height,
    d,
  }))
  const points = coords.map((c) => `${c.x},${c.y}`).join(' ')
  const last = coords[coords.length - 1]

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="overflow-visible">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {coords.slice(0, -1).map((c, i) => (
        <Tooltip key={i}>
          <TooltipTrigger asChild>
            <circle cx={c.x} cy={c.y} r={2} fill={color} className="cursor-pointer" />
          </TooltipTrigger>
          <TooltipContent>{c.d.value.toFixed(1)}°C</TooltipContent>
        </Tooltip>
      ))}
      <Tooltip>
        <TooltipTrigger asChild>
          <circle
            cx={last.x}
            cy={last.y}
            r={3}
            fill={color}
            className="cursor-pointer animate-pulse motion-reduce:animate-none"
          />
        </TooltipTrigger>
        <TooltipContent>{last.d.value.toFixed(1)}°C · live</TooltipContent>
      </Tooltip>
    </svg>
  )
}
