import { useQueryClient } from '@tanstack/react-query'
import { useLiveEvent } from './LiveEventsProvider'

/** Wires the WS firehose to targeted query-cache invalidation, once, at the
 * app root — per the spec, the query cache stays the single source of truth
 * for what renders; this hook is the only place that reacts to the socket. */
export function useGlobalLiveSync() {
  const queryClient = useQueryClient()

  useLiveEvent(['device_online', 'device_offline'], (event) => {
    queryClient.invalidateQueries({ queryKey: ['devices'] })
    if (event.device_id) queryClient.invalidateQueries({ queryKey: ['device', event.device_id] })
  })

  useLiveEvent(['relay_state_changed', 'light_state_changed', 'shadow_synchronized', 'shadow_drifted'], (event) => {
    if (event.device_id) queryClient.invalidateQueries({ queryKey: ['device', event.device_id, 'shadow'] })
  })

  useLiveEvent(['device_warning', 'attention_dismissed'], () => {
    queryClient.invalidateQueries({ queryKey: ['events'] })
  })
}
