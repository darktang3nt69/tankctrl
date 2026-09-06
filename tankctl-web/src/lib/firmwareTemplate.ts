export type DeviceType = 'esp32' | 'arduino_uno_r4'

const FIRMWARE_PATH: Record<DeviceType, string> = {
  esp32: '/firmware/tankctl_esp32.ino',
  arduino_uno_r4: '/firmware/tankctl_device.ino',
}

const DOWNLOAD_FILENAME: Record<DeviceType, string> = {
  esp32: 'tankctl_esp32.ino',
  arduino_uno_r4: 'tankctl_device.ino',
}

export interface FirmwareParams {
  deviceType: DeviceType
  deviceId: string
  wifiSsid: string
  wifiPassword: string
  mqttPassword: string
  relayPin?: number // Arduino only — its single compile-time relay
}

/** Fetches the bundled firmware source and bakes in this device's real
 * WiFi/MQTT credentials, matching the `secrets.h` convention the ESP32
 * firmware normally builds against — inlined here since this is a one-off
 * generated copy for a fresh device, not a tracked source file. */
export async function generateFirmware(params: FirmwareParams): Promise<{ filename: string; content: string }> {
  const res = await fetch(FIRMWARE_PATH[params.deviceType])
  if (!res.ok) throw new Error(`Failed to load firmware template: ${res.status}`)
  let source = await res.text()

  source = source.replace(/#define WIFI_SSID "[^"]*"/, `#define WIFI_SSID "${params.wifiSsid}"`)
  source = source.replace(/#define WIFI_PASSWORD "[^"]*"/, `#define WIFI_PASSWORD "${params.wifiPassword}"`)
  source = source.replace(/#define DEFAULT_TANK_ID "[^"]*"/, `#define DEFAULT_TANK_ID "${params.deviceId}"`)

  if (params.deviceType === 'esp32') {
    // The tracked source `#include`s secrets.h (gitignored, per-device, not
    // shipped) — a generated one-off download inlines the same two defines
    // in its place instead of shipping a second file.
    source = source.replace(
      '#include "secrets.h"       // Per-device MQTT credentials - NOT committed, see .gitignore',
      `#define MQTT_USERNAME "${params.deviceId}"\n#define MQTT_PASSWORD "${params.mqttPassword}"`,
    )
  } else if (params.relayPin !== undefined) {
    source = source.replace(/#define RELAY_PIN \d+/, `#define RELAY_PIN ${params.relayPin}`)
  }

  return { filename: DOWNLOAD_FILENAME[params.deviceType], content: source }
}

export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
