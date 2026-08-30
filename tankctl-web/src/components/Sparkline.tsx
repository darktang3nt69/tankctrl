/** Minimal decorative trend indicator for TankCard — deliberately not LineChart:
 * no axes, no interactivity, no data-table fallback. It's a glance-level cue,
 * not the accessible chart (that's LineChart on Tank Detail). */
export function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null

  const width = 120
  const height = 32
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width
    const y = height - ((v - min) / range) * height
    return `${x},${y}`
  })

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true">
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
