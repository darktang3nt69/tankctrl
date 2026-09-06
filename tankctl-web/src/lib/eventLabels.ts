/** Maps the backend's raw event-type strings (src/domain/event.py,
 * src/services/shadow_service.py, src/infrastructure/mqtt/handlers.py) to
 * human-friendly labels for the Alerts UI. Unknown/future types fall back
 * to the raw string rather than breaking. */
export const EVENT_LABELS: Record<string, string> = {
  device_registered: 'Device registered',
  device_online: 'Came online',
  device_offline: 'Went offline',
  command_sent: 'Command sent',
  command_executed: 'Command executed',
  command_failed: 'Command failed',
  light_state_changed: 'Light schedule changed',
  device_warning: 'Warning',
}

export function eventLabel(event: string): string {
  return EVENT_LABELS[event] ?? event
}
