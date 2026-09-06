import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { TankEvent } from './types'

export function useEvents(filters: { eventType?: string; deviceId?: string; limit?: number } = {}) {
  const params = new URLSearchParams()
  if (filters.eventType) params.set('event_type', filters.eventType)
  if (filters.deviceId) params.set('device_id', filters.deviceId)
  params.set('limit', String(filters.limit ?? 100))

  return useQuery({
    queryKey: ['events', filters.eventType ?? null, filters.deviceId ?? null, filters.limit ?? 100],
    queryFn: () => api.get<TankEvent[]>(`/events?${params.toString()}`),
    refetchInterval: 30_000,
  })
}

export function useEventTypes() {
  return useQuery({
    queryKey: ['events', 'types'],
    queryFn: () => api.get<string[]>('/events/types'),
    staleTime: Infinity,
  })
}

export function useDismissAttention() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { device_id: string; issue_key: string; issue_type: string }) =>
      api.post<void>('/events/dismissals', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['events'] }),
  })
}
