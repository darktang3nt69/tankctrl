import { useEffect, useState } from 'react'
import { motion, useMotionValue, useMotionValueEvent, useSpring } from 'motion/react'

const NUMERIC = /^-?\d+(\.\d+)?$/

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
    <motion.div className="rounded-lg border bg-card p-4" layout>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">
        <AnimatedValue value={value} />
        {unit && <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>}
      </div>
      {delta && <div className="mt-1 font-mono text-xs text-muted-foreground">{delta}</div>}
    </motion.div>
  )
}
