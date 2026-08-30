import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { DeviceShadow } from './types'
import { deviceKeys } from './devices'

export function useShadow(deviceId: string) {
  return useQuery({
    queryKey: ['device', deviceId, 'shadow'],
    queryFn: () => api.get<DeviceShadow>(`/devices/${deviceId}/shadow`),
    enabled: Boolean(deviceId),
  })
}

/** Sets one or more desired key/value pairs on a device's shadow — the generic
 * mechanism for toggling any relay (light, pump, or any custom relay name). */
export function useSetDesiredState(deviceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (desired: Record<string, string>) =>
      api.put<DeviceShadow>(`/devices/${deviceId}/shadow`, { desired }),
    onSuccess: (shadow) => {
      queryClient.setQueryData(['device', deviceId, 'shadow'], shadow)
      queryClient.invalidateQueries({ queryKey: deviceKeys.all })
    },
  })
}
