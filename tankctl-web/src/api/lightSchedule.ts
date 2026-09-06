import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { LightSchedule } from './types'
import { deviceKeys } from './devices'

export function useSaveLightSchedule(deviceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { on_time: string; off_time: string; enabled: boolean }) =>
      api.post<LightSchedule>(`/devices/${deviceId}/schedule`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deviceKeys.detail(deviceId) }),
  })
}

export function useDeleteLightSchedule(deviceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.delete<void>(`/devices/${deviceId}/schedule`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deviceKeys.detail(deviceId) }),
  })
}
