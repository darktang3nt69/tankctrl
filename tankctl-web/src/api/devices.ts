import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { Device, DeviceDetail } from './types'

export const deviceKeys = {
  all: ['devices'] as const,
  detail: (deviceId: string) => ['device', deviceId] as const,
}

export function useDevices() {
  return useQuery({
    queryKey: deviceKeys.all,
    // GET /devices returns { count, devices: [...] }, not a bare array.
    queryFn: () => api.get<{ count: number; devices: Device[] }>('/devices').then((r) => r.devices),
    refetchInterval: 30_000,
  })
}

export function useDeviceDetail(deviceId: string) {
  return useQuery({
    queryKey: deviceKeys.detail(deviceId),
    queryFn: () => api.get<DeviceDetail>(`/devices/${deviceId}/detail`),
    enabled: Boolean(deviceId),
  })
}

export function useRegisterDevice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { device_id: string; board_type?: 'esp32' | 'arduino_uno_r4' }) =>
      api.post<{ device_id: string; device_secret: string; mqtt_password: string; status: string }>(
        '/devices',
        body,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: deviceKeys.all }),
  })
}

export function useUpdateDeviceMetadata(deviceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { device_name?: string; location?: string; icon_type?: string; description?: string }) =>
      api.put<Device>(`/devices/${deviceId}/metadata`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deviceKeys.all })
      queryClient.invalidateQueries({ queryKey: deviceKeys.detail(deviceId) })
    },
  })
}

export function useUpdateDeviceThresholds(deviceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { temp_threshold_low?: number; temp_threshold_high?: number }) =>
      api.patch<Device>(`/devices/${deviceId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deviceKeys.all })
      queryClient.invalidateQueries({ queryKey: deviceKeys.detail(deviceId) })
    },
  })
}
