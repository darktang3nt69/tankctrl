import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { DeviceRelayConfig, RelayConfig, RelayConfigWrite, RelayPresets } from './types'

const key = (deviceId: string) => ['device', deviceId, 'relays'] as const
const presetsKey = () => ['relay', 'presets'] as const

export function useRelayPresets() {
  return useQuery({
    queryKey: presetsKey(),
    queryFn: () => api.get<RelayPresets>('/relay-presets'),
  })
}

export function useRelays(deviceId: string) {
  return useQuery({
    queryKey: key(deviceId),
    queryFn: () => api.get<DeviceRelayConfig>(`/devices/${deviceId}/relays`),
    enabled: Boolean(deviceId),
  })
}

export function useCreateRelay(deviceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: RelayConfigWrite) => api.post<RelayConfig>(`/devices/${deviceId}/relays`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key(deviceId) }),
  })
}

export function useUpdateRelay(deviceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ relayName, body }: { relayName: string; body: RelayConfigWrite }) =>
      api.patch<RelayConfig>(`/devices/${deviceId}/relays/${relayName}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key(deviceId) }),
  })
}

export function useDeleteRelay(deviceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (relayName: string) => api.delete<void>(`/devices/${deviceId}/relays/${relayName}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key(deviceId) }),
  })
}

export function usePushRelayConfig(deviceId: string) {
  return useMutation({
    mutationFn: () => api.post<{ status: string; message: string }>(`/devices/${deviceId}/relays/push-config`),
  })
}
