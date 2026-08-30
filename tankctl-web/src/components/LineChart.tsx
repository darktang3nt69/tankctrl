import { useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import './LineChart.css'

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

const PAD_L = 42
const PAD_R = 14
const PAD_T = 14
const PAD_B = 24
const WIDTH = 720

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
function formatDate(d: Date) {
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function LineChart({ data, unit = '', color, fillColor, stale, dayTicks, ariaLabel, height = 200 }: LineChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)
  const svgRef = useRef<SVGSVGElement | null>(null)

  const plotW = WIDTH - PAD_L - PAD_R
  const plotH = height - PAD_T - PAD_B

  const { path, areaPath, x, y, gridSteps } = useMemo(() => {
    if (data.length === 0) {
      return { path: '', areaPath: '', x: () => 0, y: () => 0, gridSteps: [] as number[] }
    }
    const values = data.map((d) => d.value)
    let min = Math.min(...values)
    let max = Math.max(...values)
    const padValue = (max - min) * 0.15 || 1
    min -= padValue
    max += padValue

    const xScale = (i: number) => PAD_L + (data.length === 1 ? 0 : (i / (data.length - 1)) * plotW)
    const yScale = (v: number) => PAD_T + plotH - ((v - min) / (max - min)) * plotH

    let d0 = `M${xScale(0)},${yScale(data[0].value)}`
    for (let i = 1; i < data.length; i++) d0 += ` L${xScale(i)},${yScale(data[i].value)}`
    const area = `${d0} L${xScale(data.length - 1)},${PAD_T + plotH} L${xScale(0)},${PAD_T + plotH} Z`

    const steps = 4
    const grid = Array.from({ length: steps + 1 }, (_, s) => min + (max - min) * (s / steps))

    return { path: d0, areaPath: area, x: xScale, y: yScale, gridSteps: grid }
  }, [data, plotH, plotW])

  if (data.length === 0) {
    return <div className="line-chart line-chart--empty">No data yet</div>
  }

  const lastIdx = data.length - 1
  const activeIdx = hoverIdx ?? lastIdx
  const active = data[activeIdx]

  function handleMove(evt: React.PointerEvent<SVGRectElement>) {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const px = ((evt.clientX - rect.left) * WIDTH) / rect.width
    const idx = Math.max(0, Math.min(lastIdx, Math.round(((px - PAD_L) / plotW) * lastIdx)))
    setHoverIdx(idx)
  }

  return (
    <div className="line-chart">
      <div className="line-chart__wrap">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${height}`}
          role="img"
          aria-label={ariaLabel}
          className="line-chart__svg"
        >
          {gridSteps.map((v, i) => (
            <g key={i}>
              <line
                x1={PAD_L}
                x2={WIDTH - PAD_R}
                y1={y(v)}
                y2={y(v)}
                stroke="var(--border)"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
              <text x={PAD_L - 8} y={y(v) + 3.5} textAnchor="end" className="line-chart__axis-label">
                {v.toFixed(0)}
                {unit}
              </text>
            </g>
          ))}
          <motion.path
            d={areaPath}
            fill={fillColor}
            stroke="none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          />
          <motion.path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          />
          {[0, 1, 2, 3, 4].map((tick) => {
            const idx = Math.round(lastIdx * (tick / 4))
            return (
              <text
                key={tick}
                x={x(idx)}
                y={height - 8}
                textAnchor={tick === 0 ? 'start' : tick === 4 ? 'end' : 'middle'}
                className="line-chart__axis-label"
              >
                {dayTicks ? formatDate(data[idx].t) : formatTime(data[idx].t)}
              </text>
            )
          })}
          <circle cx={x(lastIdx)} cy={y(data[lastIdx].value)} r={7} fill="var(--surface)" />
          <circle cx={x(lastIdx)} cy={y(data[lastIdx].value)} r={5} fill={stale ? 'var(--ink-faint)' : color} />
          {hoverIdx !== null && (
            <>
              <line x1={x(hoverIdx)} x2={x(hoverIdx)} y1={PAD_T} y2={PAD_T + plotH} stroke="var(--ink-faint)" strokeWidth={1} />
              <circle cx={x(hoverIdx)} cy={y(data[hoverIdx].value)} r={5} fill={color} stroke="var(--surface)" strokeWidth={2} />
            </>
          )}
          <rect
            x={PAD_L}
            y={PAD_T}
            width={plotW}
            height={plotH}
            fill="transparent"
            onPointerMove={handleMove}
            onPointerLeave={() => setHoverIdx(null)}
          />
        </svg>
        <div className="line-chart__readout mono">
          {dayTicks ? formatDate(active.t) : formatTime(active.t)} · {active.value.toFixed(1)}
          {unit}
          {stale && activeIdx === lastIdx && <span className="line-chart__stale-tag"> · stale</span>}
        </div>
      </div>
      <button type="button" className="btn btn--ghost line-chart__table-toggle" onClick={() => setShowTable((s) => !s)}>
        {showTable ? 'Hide table' : 'View as table'}
      </button>
      {showTable && (
        <table className="data-table line-chart__table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {data.slice(-24).map((d, i) => (
              <tr key={i}>
                <td className="mono">
                  {formatTime(d.t)} · {formatDate(d.t)}
                </td>
                <td className="mono">
                  {d.value.toFixed(1)}
                  {unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
