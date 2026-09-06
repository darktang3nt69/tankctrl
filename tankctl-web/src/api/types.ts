export type DeviceStatus = 'online' | 'offline' | 'time_unknown'

export type RelayType = 'light' | 'pump' | 'co2' | 'temp_sensor' | 'servo'

export interface Device {
  device_id: string
  device_name: string | null
  location: string | null
  icon_type: string
  description: string | null
  status: DeviceStatus
  firmware_version: string | null
  created_at: string | null
  last_seen: string | null
  uptime_ms: number | null
  rssi: number | null
  wifi_status: string | null
  board_type: 'esp32' | 'arduino_uno_r4'
  temp_threshold_low: number | null
  temp_threshold_high: number | null
}

export interface LightSchedule {
  device_id: string
  on_time: string
  off_time: string
  enabled: boolean
  created_at: string | null
  updated_at: string | null
}

export type WaterScheduleType = 'weekly' | 'custom' | 'interval'

export interface WaterSchedule {
  id: number
  device_id: string
  schedule_type: WaterScheduleType
  days_of_week: number[] | null
  schedule_date: string | null
  interval_days: number | null
  schedule_time: string
  notes: string | null
  completed: boolean
  enabled: boolean
  notify_24h: boolean
  notify_1h: boolean
  notify_on_time: boolean
  ph: number | null
  ammonia: number | null
  nitrite: number | null
  nitrate: number | null
  tds: number | null
  created_at: string | null
  updated_at: string | null
}

export type WaterScheduleWrite = Omit<
  WaterSchedule,
  'id' | 'device_id' | 'created_at' | 'updated_at'
>

export interface DeviceDetail extends Device {
  light_schedule: LightSchedule | null
  water_schedules: WaterSchedule[]
}

export interface RelayPreset {
  gpio_pin: number
  active_level: 'LOW' | 'HIGH'
  pwm: boolean
}

export interface RelayConfig {
  relay_name: string
  relay_type: RelayType
  gpio_pin: number
  active_level: 'LOW' | 'HIGH'
  default_state: 'on' | 'off'
  fail_safe_default: 'on' | 'off'
  cutoff_ceiling_seconds: number | null
  created_at: string | null
  updated_at: string | null
}

export interface RelayConfigWrite {
  relay_name: string
  relay_type: RelayType
  gpio_pin: number
  active_level: 'LOW' | 'HIGH'
  default_state: 'on' | 'off'
  fail_safe_default: 'on' | 'off'
  cutoff_ceiling_seconds: number | null
}

export interface RelayPresets {
  presets: Record<RelayType, RelayPreset>
  safe_pins: Record<'esp32' | 'arduino_uno_r4', number[]>
}

export interface DeviceRelayConfig {
  device_id: string
  relays: Record<string, RelayConfig>
  count: number
}

export interface DeviceShadow {
  device_id: string
  desired: Record<string, string>
  reported: Record<string, string>
  version: number
  synchronized: boolean
}

export type CommandStatus = 'pending' | 'sent' | 'executed' | 'failed' | 'timeout'

export interface Command {
  command_id: string | null
  device_id: string
  command: string
  value: string | null
  version: number
  status: CommandStatus
  created_at: string | null
}

export interface CommandHistory {
  count: number
  commands: Command[]
}

export interface TelemetryPoint {
  time: string
  device_id: string
  temperature: number | null
  tds: number | null
  pressure: number | null
  metadata: Record<string, unknown> | null
}

export interface TelemetryResponse {
  device_id: string
  count: number
  data: TelemetryPoint[]
}

export interface HourlyStat {
  avg: number
  max: number
  min: number
}

export interface HourlySummaryPoint {
  hour: string
  device_id: string
  temperature: HourlyStat | null
  tds: HourlyStat | null
  sample_count: number
}

export interface HourlySummaryResponse {
  device_id: string
  count: number
  data: HourlySummaryPoint[]
}

export interface TankEvent {
  event: string
  device_id: string | null
  timestamp: number
  metadata: Record<string, unknown>
}

/** Live event shape received on the WebSocket firehose (`/ws`). */
export interface LiveEvent extends TankEvent {
  [key: string]: unknown
}
