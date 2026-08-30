import { useEffect, useState } from 'react'
import { motion, useMotionValue, useMotionValueEvent, useSpring } from 'motion/react'
import './StatTile.css'

const NUMERIC = /^-?\d+(\.\d+)?$/

/** Springs toward a new numeric value instead of snapping — passes non-numeric
 * strings (times, "—") through untouched rather than trying to animate them. */
function AnimatedValue({ value }: { value: string }) {
  const trimmed = value.trim()
  const isNumeric = NUMERIC.test(trimmed)
  const decimals = isNumeric && trimmed.includes('.') ? trimmed.split('.')[1].length : 0

  const target = isNumeric ? Number(trimmed) : 0
  const motionValue = useMotionValue(target)
  const spring = useSpring(motionValue, { stiffness: 120, damping: 20 })
  const [display, setDisplay] = useState(trimmed)

  useEffect(() => {
    if (isNumeric) motionValue.set(target)
    else setDisplay(trimmed)
  }, [target, isNumeric, trimmed, motionValue])

  useMotionValueEvent(spring, 'change', (latest) => {
    if (isNumeric) setDisplay(latest.toFixed(decimals))
  })

  return <>{display}</>
}

export function StatTile({
  label,
  value,
  unit,
  delta,
}: {
  label: string
  value: string
  unit?: string
  delta?: string
}) {
  return (
    <motion.div className="stat-tile" layout>
      <div className="stat-tile__label">{label}</div>
      <div className="stat-tile__value mono">
        <AnimatedValue value={value} />
        {unit && <span className="stat-tile__unit">{unit}</span>}
      </div>
      {delta && <div className="stat-tile__delta mono">{delta}</div>}
    </motion.div>
  )
}
