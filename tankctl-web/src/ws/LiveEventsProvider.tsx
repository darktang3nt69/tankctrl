import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { wsUrl } from '../api/client'
import type { LiveEvent } from '../api/types'

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'polling-fallback'

type Listener = (event: LiveEvent) => void

interface LiveEventsContextValue {
  status: ConnectionStatus
  subscribe: (listener: Listener) => () => void
}

const LiveEventsContext = createContext<LiveEventsContextValue | null>(null)

const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 15_000
/** After this many failed reconnect attempts, consumers should fall back to polling
 * rather than waiting on the socket — matches the spec's "never silently stop updating" rule. */
const POLLING_FALLBACK_AFTER_ATTEMPTS = 3

export function LiveEventsProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const listenersRef = useRef(new Set<Listener>())
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<number | undefined>(undefined)
  const reconnectAttemptRef = useRef(0)

  useEffect(() => {
    let cancelled = false

    function scheduleReconnect() {
      reconnectAttemptRef.current += 1
      if (reconnectAttemptRef.current >= POLLING_FALLBACK_AFTER_ATTEMPTS) {
        setStatus('polling-fallback')
      }
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttemptRef.current, RECONNECT_MAX_MS)
      reconnectTimerRef.current = window.setTimeout(connect, delay)
    }

    function connect() {
      if (cancelled) return
      setStatus((prev) => (prev === 'connected' ? prev : 'connecting'))
      const ws = new WebSocket(wsUrl())
      wsRef.current = ws

      ws.onopen = () => {
        reconnectAttemptRef.current = 0
        setStatus('connected')
      }
      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data) as LiveEvent
          listenersRef.current.forEach((listener) => listener(data))
        } catch {
          // Malformed frame — ignore rather than crash the whole live layer.
        }
      }
      ws.onclose = () => {
        if (cancelled) return
        setStatus('reconnecting')
        scheduleReconnect()
      }
      ws.onerror = () => {
        ws.close()
      }
    }

    connect()
    return () => {
      cancelled = true
      window.clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
    }
  }, [])

  const subscribe = useCallback((listener: Listener) => {
    listenersRef.current.add(listener)
    return () => listenersRef.current.delete(listener)
  }, [])

  return <LiveEventsContext.Provider value={{ status, subscribe }}>{children}</LiveEventsContext.Provider>
}

function useLiveEventsContext(): LiveEventsContextValue {
  const ctx = useContext(LiveEventsContext)
  if (!ctx) throw new Error('useLiveEventsContext must be used within LiveEventsProvider')
  return ctx
}

export function useLiveConnectionStatus(): ConnectionStatus {
  return useLiveEventsContext().status
}

/** Subscribe to every event on the firehose matching one of `eventNames`. */
export function useLiveEvent(eventNames: string[], handler: Listener) {
  const { subscribe } = useLiveEventsContext()
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  })

  const key = eventNames.join(',')
  useEffect(() => {
    return subscribe((event) => {
      if (key.split(',').includes(event.event)) handlerRef.current(event)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is eventNames joined to a stable primitive on purpose
  }, [subscribe, key])
}
