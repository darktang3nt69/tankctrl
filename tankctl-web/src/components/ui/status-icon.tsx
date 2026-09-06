import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'

type StatusIconState = 'on' | 'off' | 'online' | 'offline' | 'warn'

export function StatusIcon({
  icon: Icon,
  state,
  className,
}: {
  icon: LucideIcon
  state: StatusIconState
  className?: string
}) {
  const stateClasses = {
    on: 'bg-[var(--safe-fill)] text-[var(--safe)]',
    online: 'bg-[var(--safe-fill)] text-[var(--safe)]',
    warn: 'bg-[var(--warn-fill)] text-[var(--warn)]',
    off: 'bg-muted text-muted-foreground',
    offline: 'bg-[var(--danger-fill)] text-[var(--danger)]',
  }

  return (
    <div
      className={cn(
        'inline-flex items-center justify-center rounded-full size-9',
        stateClasses[state],
        className,
      )}
      role="img"
      aria-label={`Status: ${state}`}
    >
      <Icon size={20} strokeWidth={1.5} />
    </div>
  )
}
