import { useRef } from 'react'
import { useLiveEvent } from '../../ws/LiveEventsProvider'

export type CommandAckResult = 'executed' | 'failed' | 'timeout'

interface PendingAck {
  command: string
  value?: string
  resolve: (result: CommandAckResult) => void
  timer: number
}

/** Waits for the device to actually report a command applied, via the
 * `/ws` event stream's `command_executed`/`command_failed` events, instead
 * of trusting an immediate HTTP 200 as "done". `command_failed` is not
 * currently emitted by the backend for genuine delivery failures (nothing
 * calls `mark_command_failed`), so a command that's truly never delivered
 * resolves as 'timeout' rather than 'failed' — that's a backend gap, not
 * something this hook can see past. */
export function useCommandAck(deviceId: string) {
  const pendingRef = useRef<PendingAck[]>([])

  useLiveEvent(['command_executed', 'command_failed'], (event) => {
    if (event.device_id !== deviceId) return
    const meta = (event.metadata ?? {}) as Record<string, unknown>
    const command = typeof meta.command === 'string' ? meta.command : undefined
    const value = typeof meta.value === 'string' ? meta.value : undefined
    if (!command) return

    pendingRef.current = pendingRef.current.filter((p) => {
      if (p.command !== command || (p.value !== undefined && p.value !== value)) return true
      window.clearTimeout(p.timer)
      p.resolve(event.event === 'command_executed' ? 'executed' : 'failed')
      return false
    })
  })

  function awaitCommand(command: string, value?: string, timeoutMs = 10_000): Promise<CommandAckResult> {
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        pendingRef.current = pendingRef.current.filter((p) => p.resolve !== resolveOnce)
        resolve('timeout')
      }, timeoutMs)
      function resolveOnce(result: CommandAckResult) {
        window.clearTimeout(timer)
        resolve(result)
      }
      pendingRef.current.push({ command, value, resolve: resolveOnce, timer })
    })
  }

  return { awaitCommand }
}
