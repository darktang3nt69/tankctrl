import './StatusPill.css'

export type PillTone = 'ok' | 'warn' | 'danger'

const TONE_LABEL: Record<PillTone, string> = {
  ok: 'Online',
  warn: 'Reconnecting',
  danger: 'Offline',
}

export function StatusPill({ tone, label }: { tone: PillTone; label?: string }) {
  return (
    <span className={`status-pill status-pill--${tone}`} role="status">
      <span className="status-pill__dot" aria-hidden="true" />
      <span>{label ?? TONE_LABEL[tone]}</span>
    </span>
  )
}
