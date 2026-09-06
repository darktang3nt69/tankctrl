import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { WaterSchedule, WaterScheduleWrite } from './types'

const key = (deviceId: string) => ['device', deviceId, 'water-schedules'] as const

export function useWaterSchedules(deviceId: string) {
  return useQuery({
    queryKey: key(deviceId),
    queryFn: () => api.get<WaterSchedule[]>(`/devices/${deviceId}/water-schedules`),
    enabled: Boolean(deviceId),
  })
}

export function useCreateWaterSchedule(deviceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: WaterScheduleWrite) =>
      api.post<WaterSchedule>(`/devices/${deviceId}/water-schedules`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key(deviceId) }),
  })
}

export function useUpdateWaterSchedule(deviceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ scheduleId, body }: { scheduleId: number; body: WaterScheduleWrite }) =>
      api.put<WaterSchedule>(`/devices/${deviceId}/water-schedules/${scheduleId}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key(deviceId) }),
  })
}

export function useDeleteWaterSchedule(deviceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (scheduleId: number) =>
      api.delete<void>(`/devices/${deviceId}/water-schedules/${scheduleId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key(deviceId) }),
  })
}
