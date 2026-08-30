import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { Command, CommandHistory } from './types'
import { deviceKeys } from './devices'

export function useCommandHistory(deviceId: string, limit = 20) {
  return useQuery({
    queryKey: ['device', deviceId, 'commands', limit],
    queryFn: () => api.get<CommandHistory>(`/devices/${deviceId}/commands?limit=${limit}`),
    enabled: Boolean(deviceId),
  })
}

export function useSetLight(deviceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (state: 'on' | 'off') => api.post<Command>(`/devices/${deviceId}/light`, { state }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deviceKeys.all })
      queryClient.invalidateQueries({ queryKey: ['device', deviceId, 'shadow'] })
    },
  })
}

export function useSetPump(deviceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (state: 'on' | 'off') => api.post<Command>(`/devices/${deviceId}/pump`, { state }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['device', deviceId, 'shadow'] }),
  })
}

export function useRebootDevice(deviceId: string) {
  return useMutation({
    mutationFn: () => api.post<Command>(`/devices/${deviceId}/reboot`),
  })
}

export function useRequestStatus(deviceId: string) {
  return useMutation({
    mutationFn: () => api.post<Command>(`/devices/${deviceId}/request-status`),
  })
}
