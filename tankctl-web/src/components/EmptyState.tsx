import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { IconInbox } from './icons'

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <motion.div
      className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center text-muted-foreground"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
    >
      <IconInbox size={28} strokeWidth={1.5} />
      <p className="font-medium text-foreground">{title}</p>
      {description && <p className="text-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </motion.div>
  )
}
