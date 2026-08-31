import { Badge } from './ui/badge'
import { cn } from '../lib/utils'

export type PillTone = 'ok' | 'warn' | 'danger'

const TONE_LABEL: Record<PillTone, string> = {
  ok: 'Online',
  warn: 'Reconnecting',
  danger: 'Offline',
}

const TONE_CLASS: Record<PillTone, string> = {
  ok: 'border-transparent bg-[var(--safe-fill)] text-[var(--safe)]',
  warn: 'border-transparent bg-[var(--warn-fill)] text-[var(--warn)]',
  danger: 'border-transparent bg-[var(--danger-fill)] text-[var(--danger)]',
}

const DOT_CLASS: Record<PillTone, string> = {
  ok: 'bg-[var(--safe)]',
  warn: 'bg-[var(--warn)]',
  danger: 'bg-[var(--danger)]',
}

export function StatusPill({ tone, label }: { tone: PillTone; label?: string }) {
  return (
    <Badge role="status" className={cn('gap-1.5 font-medium', TONE_CLASS[tone])}>
      <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', DOT_CLASS[tone])} />
      {label ?? TONE_LABEL[tone]}
    </Badge>
  )
}
