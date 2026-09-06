import { useId, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { TrendingUp } from 'lucide-react'
import { Button } from './ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { formatDate, formatTime } from '../lib/date'

export interface ChartPoint {
  t: Date
  value: number
}

interface LineChartProps {
  data: ChartPoint[]
  unit?: string
  color: string
  fillColor: string
  stale?: boolean
  dayTicks?: boolean
  ariaLabel: string
  height?: number
}

function tickLabel(d: Date, dayTicks?: boolean) {
  return dayTicks ? formatDate(d) : formatTime(d)
}

function ChartTooltip({
  active,
  payload,
  unit,
  dayTicks,
}: {
  active?: boolean
  payload?: { payload: ChartPoint }[]
  unit: string
  dayTicks?: boolean
}) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md">
      <div className="font-mono text-muted-foreground">{tickLabel(point.t, dayTicks)}</div>
      <div className="font-mono font-semibold">
        {point.value.toFixed(1)}
        {unit}
      </div>
    </div>
  )
}

/** The accessible, detailed chart (Tank Detail) — Recharts-based for real
 * tooltips/gradient fills, pre-styled to the existing --series-* tokens.
 * TankCard's Sparkline stays hand-rolled SVG (glance-level, not this). */
export function LineChart({ data, unit = '', color, fillColor, stale, dayTicks, ariaLabel, height = 200 }: LineChartProps) {
  const [showTable, setShowTable] = useState(false)
  const gradientId = useId()

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        <TrendingUp className="size-6 opacity-40" />
        <span>No data yet</span>
      </div>
    )
  }

  const last = data[data.length - 1]

  return (
    <div className="flex flex-col gap-1.5" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={fillColor} stopOpacity={1} />
              <stop offset="100%" stopColor={fillColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="t"
            tickFormatter={(t: Date) => tickLabel(t, dayTicks)}
            tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--muted-foreground)' }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            tickFormatter={(v: number) => `${v.toFixed(0)}${unit}`}
            tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
            width={42}
          />
          <Tooltip content={<ChartTooltip unit={unit} dayTicks={dayTicks} />} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={stale ? 'var(--muted-foreground)' : color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 5, stroke: 'var(--card)', strokeWidth: 2 }}
            isAnimationActive={true}
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="font-mono text-xs text-muted-foreground">
        {tickLabel(last.t, dayTicks)} · {last.value.toFixed(1)}
        {unit}
        {stale && <span className="ml-1 font-semibold text-[var(--warn)]"> · stale</span>}
      </div>
      <Button type="button" variant="ghost" size="sm" className="self-start text-xs underline decoration-dotted" onClick={() => setShowTable((s) => !s)}>
        {showTable ? 'Hide table' : 'View as table'}
      </Button>
      {showTable && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.slice(-24).map((d, i) => (
              <TableRow key={i}>
                <TableCell className="font-mono">
                  {formatTime(d.t)} · {formatDate(d.t)}
                </TableCell>
                <TableCell className="font-mono">
                  {d.value.toFixed(1)}
                  {unit}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
