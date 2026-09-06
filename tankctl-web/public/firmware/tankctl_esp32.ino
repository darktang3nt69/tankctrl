/**
 * TankCtl ESP32 Device Firmware v2.0.0 - Multi-Relay Support
 * 
 * PHASE 4: Multi-Relay Flexible Configuration
 * 
 * Features:
 * - Support for up to 10 relays per device (light, pump, heater, etc.)
 * - Dynamic GPIO pin configuration (pins 0-39 validated)
 * - Active-LOW and Active-HIGH relay logic support
 * - NVS persistence of relay configuration across reboots
 * - MQTT config reception: tankctl/{device_id}/config
 * - Generic relay control with backward compatibility for legacy commands
 * - Safe defaults: pump ON (fail-safe), light OFF
 * - Full relay state reporting: tankctl/{device_id}/reported
 * 
 * MQTT Protocol:
 * - Subscribe: tankctl/{device_id}/command
 *   Commands: {"command": "set_light", "value": "on", "version": N}
 *            {"command": "set_pump", "value": "on", "version": N}
 *            {"command": "set_relay", "relay_name": "heater", "value": "on", "version": N}
 *            {"command": "set_schedule", "on_time": "18:00", "off_time": "06:00", "version": N}
 *            {"command": "reboot_device", "version": N}
 * 
 * - Subscribe: tankctl/{device_id}/config
 *   Config: {"relays": [{"relay_name": "light", "gpio_pin": 4, "active_level": "LOW"}, ...]}
 * 
 * - Publish: tankctl/{device_id}/reported
 *   State: {"light": "on", "pump": "off", "heater": "off"}
 * 
 * - Publish: tankctl/{device_id}/telemetry
 *   Telemetry: {"temperature": 24.5}
 * 
 * - Publish: tankctl/{device_id}/heartbeat
 *   Heartbeat: {"status": "online", "uptime_ms": 123456, "free_heap": 250000}
 *   Status is "online" normally, or "time_unknown" when the device does not
 *   trust its own clock (see Fail-Safe Stack below) - the light schedule is
 *   not applied while in that state.
 *
 * ===== FAIL-SAFE RELAY STACK (Layers 1-4) =====
 * The device must never depend on network/backend availability to do the
 * safe thing with a relay. Three independent layers, on top of MQTT
 * command handling:
 *
 * Layer 1 - RTC (DS3231 via RTClib, I2C SDA=21/SCL=22, see PINOUT.md):
 *   Read once at boot. rtc.lostPower() true (dead battery / first boot,
 *   or the chip isn't even present yet) means the device cannot trust any
 *   time it has -> feeds Layer 4 (time_unknown) below. NOT YET VERIFIED ON
 *   HARDWARE - DS3231 module ordered but not arrived; logic reviewed by
 *   hand, see initRtc()/syncRtcFromNtpIfAvailable() comments for the
 *   specific things that need confirming once it's in hand.
 *
 * Layer 2 - local schedule engine (runSchedule(), ticks every ~1s from
 *   loop()): reads the DS3231 directly (never system/NTP time), compares
 *   against the on/off schedule cached in NVS Preferences, and drives the
 *   "light" relay's GPIO directly. Works with zero live MQTT/WiFi once a
 *   schedule is cached. No cached schedule yet -> light stays at its
 *   fail_safe_default (see relay config, below) instead of an arbitrary
 *   boot GPIO level.
 *
 * Layer 3 - independent hard-cutoff watchdog (checkCutoffWatchdog(), own
 *   ~1s timer, own onSinceMs counters): a SEPARATE code path from Layer 2,
 *   sharing no logic with the scheduler, so a scheduler bug cannot disable
 *   it. For any relay with a positive cutoff_ceiling_seconds, tracks how
 *   long it has been continuously on (however it got turned on - schedule,
 *   command, or boot default) and forces it off directly at the GPIO level
 *   once the ceiling is passed, regardless of what the scheduler or an
 *   inbound command currently says.
 *
 * Layer 4 - time_unknown: triggered by Layer 1's lostPower (or no RTC
 *   found at all) OR the cached NVS schedule failing its checksum. On
 *   trigger, every relay is forced to its fail_safe_default immediately
 *   (applyFailSafeDefaults(), not gated on Layer 3's timer), the device
 *   publishes "time_unknown" instead of "online" on the heartbeat topic,
 *   and Layer 2 is skipped entirely (no guessing) until a real time fix
 *   arrives: a successful NTP sync (which also re-writes the RTC) clears
 *   the RTC half, and a freshly-saved schedule (set_schedule command or
 *   syncScheduleFromAPI) clears the schedule-checksum half.
 *
 * Per-relay fail-safe contract (fail_safe_default, cutoff_ceiling_seconds):
 *   pushed by the backend as part of the existing relay-config MQTT push
 *   (tankctl/{device_id}/config) and cached to NVS alongside gpio_pin/
 *   active_level so it survives reboot without a live MQTT connection.
 *   fail_safe_default defaults to "on" for a relay named "pump" and "off"
 *   for everything else when a relay's config doesn't carry the field
 *   (legacy NVS blob / older backend) - matches this file's long-standing
 *   "pump fails safe on, light fails safe off" convention.
 *
 * Memory Footprint:
 * - Static RAM: ~200 KB (relays array, JSON buffers, WiFi/MQTT libraries)
 * - Heap (normal): ~100 KB (runtime buffers, MQTT payloads)
 * - Total: ~300 KB / 520 KB (57% utilization)
 * - Failure modes handled: WiFi drop, MQTT disconnect, oversized payload, heap pressure
 * 
 * NVS Storage (Preferences namespace "tankctl"):
 * - "tank_id": Device ID string
 * - "device_secret": Device registration secret
 * - "relays": JSON array of relay configurations (now includes
 *   fail_safe_default and cutoff_ceiling_seconds per relay)
 * - "sched_on_h", "sched_on_m", "sched_off_h", "sched_off_m": Schedule times
 * - "sched_enabled": Schedule enabled flag
 * - "sched_valid": true once a schedule has been saved at least once
 * - "sched_chk": checksum over the schedule fields above (Layer 4 integrity check)
 *
 * Relay Configuration (NVS "relays"):
 * [
 *   {"relay_name": "light", "gpio_pin": 4, "active_level": "LOW",
 *    "fail_safe_default": "off", "cutoff_ceiling_seconds": null},
 *   {"relay_name": "pump", "gpio_pin": 12, "active_level": "LOW",
 *    "fail_safe_default": "on", "cutoff_ceiling_seconds": null}
 * ]
 *
 * Default Relay Config (if NVS empty):
 * - light: GPIO D4 (pin 4), active-LOW, fail_safe_default OFF
 * - pump: GPIO D12 (pin 12), active-LOW, fail_safe_default ON (fail-safe)
 * Every relay is forced to its fail_safe_default at boot (applyFailSafeDefaults()),
 * then Layer 2 immediately re-evaluates the light relay if a schedule is cached
 * and time is known.
 *
 * Safety Considerations:
 * ✓ Every relay forced to fail_safe_default at boot, not left at boot-time GPIO level
 * ✓ Independent hard-cutoff watchdog (Layer 3) enforces cutoff_ceiling_seconds
 *   regardless of scheduler/command state
 * ✓ time_unknown (Layer 4) forces fail-safe defaults and withholds the schedule
 *   until a real time fix arrives
 * ✓ GPIO conflicts detected and rejected
 * ✓ Command version validation (idempotency)
 * ✓ Duplicate relay names rejected
 * ✓ Duplicate GPIO pins rejected
 * ✓ GPIO range validated (0-39)
 * ✓ Invalid JSON config keeps previous config
 * ✓ Config changes trigger GPIO re-initialization
 * 
 * Testing Checklist:
 * [ ] Compile without errors (Arduino IDE)
 * [ ] Device boots with default relays (light:D4, pump:D12)
 * [ ] Receive config message and reconfigure (MQTT)
 * [ ] Set light via command: {"command": "set_light", "value": "on", "version": 1}
 * [ ] Set pump via command: {"command": "set_pump", "value": "on", "version": 2}
 * [ ] Set relay via generic command: {"command": "set_relay", "relay_name": "pump", "value": "off", "version": 3}
 * [ ] Reported state includes all relays: {"light": "on", "pump": "on"}
 * [ ] NVS persists config across reboots
 * [ ] Invalid config rejected gracefully (logs error, keeps previous)
 * [ ] GPIO conflict detected and rejected
 * [ ] Duplicate relay name rejected
 * [ ] Schedule still works for light relay
 * [ ] Heap usage monitored (target < 50%)
 */

// ===== CONFIG =====
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

#define MQTT_SERVER "192.168.1.100"
#define MQTT_PORT 1883

#define REGISTRATION_SERVER "192.168.1.100"
#define REGISTRATION_PORT 8000
#define REGISTRATION_ENDPOINT "/devices"

#define DEFAULT_TANK_ID "POND-ESP32"
#define ONE_WIRE_PIN 23    // GPIO 23 for temperature sensor
#define STATUS_LED_PIN 2   // GPIO 2 for status LED (optional, built-in on many ESP32 boards)
#define TDS_PIN 34         // GPIO 34 (ADC1, input-only) for the TDS probe's analog output

// ponytail: linear ADC->ppm conversion, no temperature compensation. Real TDS
// probes need calibration against a reference solution (e.g. 342ppm/707uS
// standard) - replace this constant once the actual probe is on hand.
#define TDS_CALIBRATION_FACTOR 0.5f

// Multi-relay defaults (if NVS config unavailable)
#define DEFAULT_LIGHT_GPIO 4
#define DEFAULT_PUMP_GPIO 12
#define DEFAULT_ACTIVE_LEVEL "LOW"

#define TELEMETRY_INTERVAL_MS 10000UL
#define HEARTBEAT_INTERVAL_MS 30000UL
#define WIFI_RETRY_INTERVAL_MS 5000UL
#define HEALTH_LOG_INTERVAL_MS 60000UL
#define MQTT_RETRY_INTERVAL_MS 3000UL
#define NTP_UPDATE_INTERVAL_MS 3600000UL // Sync once every hour
#define SCHEDULE_CHECK_INTERVAL_MS 1000UL
#define TEMP_SENSOR_RESOLUTION_BITS 10
#define TEMP_CONVERSION_DELAY_MS 200UL
#define TIMEZONE_NAME "Asia/Kolkata"
#define TIMEZONE_OFFSET_SECONDS 19800

#define TANK_ID_MAX_LEN 32
#define DEVICE_SECRET_MAX_LEN 64
#define FIRMWARE_VERSION "2.0.0-esp32-multi-relay"

// Relay constraints
#define MAX_RELAYS 10
#define RELAY_NAME_MAX_LEN 32
// Bumped from 512: each relay's config now also carries fail_safe_default
// and cutoff_ceiling_seconds (Layer 3/4), so the same relay count needs
// more bytes than the original gpio_pin/active_level-only payload.
#define RELAY_CONFIG_JSON_MAX 1024

// Layer 3: hard-cutoff watchdog tick interval - deliberately its own
// interval/timer, not shared with SCHEDULE_CHECK_INTERVAL_MS, so nothing
// about Layer 2's timing can affect it.
#define WATCHDOG_CHECK_INTERVAL_MS 1000UL

// ===== LIBRARIES =====
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Preferences.h>
#include <time.h>
#include <Wire.h>
#include <RTClib.h>       // Adafruit RTClib - DS3231 driver (Layer 1)
#include "secrets.h"       // Per-device MQTT credentials - NOT committed, see .gitignore

// Random temp range for testing (disable sensor reading)
#define USE_RANDOM_TEMP 1  // Set to 0 to use real DS18B20 sensor
#define TEMP_MIN 22.0f
#define TEMP_MAX 32.0f

// ===== RELAY STRUCTURES =====
struct RelayPin {
  char relay_name[RELAY_NAME_MAX_LEN];
  uint8_t gpio_pin;
  char active_level[5];  // "LOW" or "HIGH"
  bool current_state;    // "on" or "off"
  char fail_safe_default[4];  // "on" or "off" - Layer 2/4 boot & time_unknown target
  int cutoff_ceiling_seconds; // Layer 3 hard-cutoff ceiling; -1 = no ceiling (fails open)
};

// ===== GLOBAL STATE =====
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);
Preferences preferences;
OneWire oneWire(ONE_WIRE_PIN);
DallasTemperature sensors(&oneWire);
RTC_DS3231 rtc;

char tankId[TANK_ID_MAX_LEN] = {0};
char deviceSecret[DEVICE_SECRET_MAX_LEN] = {0};
bool deviceRegistered = false;
float temperature = 0.0;
float tdsPpm = 0.0;
int lastCommandVersion = 0;

// Multi-relay management
RelayPin relays[MAX_RELAYS];
int relay_count = 0;
bool relayStateChanged = false;  // Flag to publish reported state on any relay change

// Layer 3: independent hard-cutoff watchdog state. Deliberately separate
// from anything the scheduler (Layer 2) touches - see checkCutoffWatchdog().
unsigned long relayOnSinceMs[MAX_RELAYS] = {0};

int scheduleOnHour = 18;
int scheduleOnMinute = 0;
int scheduleOffHour = 6;
int scheduleOffMinute = 0;
bool scheduleEnabled = false;

// Layer 1/4: RTC + time_unknown state. Both default to "unknown"/"unsafe"
// until proven otherwise, so a crash/reset before initRtc() runs never
// accidentally leaves the device trusting a clock it hasn't checked.
bool rtcPresent = false;
bool timeUnknownRtc = true;
bool timeUnknownSchedule = false;

unsigned long lastTelemetryMs = 0;
unsigned long lastHeartbeatMs = 0;
unsigned long lastWifiRetryMs = 0;
unsigned long lastMqttRetryMs = 0;
unsigned long lastHealthLogMs = 0;
unsigned long lastNtpUpdateMs = 0;
unsigned long lastScheduleCheckMs = 0;
unsigned long lastWatchdogCheckMs = 0;
unsigned long tempRequestMs = 0;
bool wasWifiConnected = false;
bool tempConversionInProgress = false;

char topicCommand[64];
char topicReported[64];
char topicTelemetry[64];
char topicHeartbeat[64];
char topicStatus[64];
char topicConfig[64];

bool isTimeInScheduleWindow(int currentHour, int currentMinute) {
  int currentMinutes = (currentHour * 60) + currentMinute;
  int onMinutes = (scheduleOnHour * 60) + scheduleOnMinute;
  int offMinutes = (scheduleOffHour * 60) + scheduleOffMinute;

  if (onMinutes == offMinutes) {
    return false;
  }

  // Cross-midnight window, e.g. 18:00 -> 06:00
  if (onMinutes > offMinutes) {
    return (currentMinutes >= onMinutes) || (currentMinutes < offMinutes);
  }

  // Same-day window, e.g. 06:00 -> 18:00
  return (currentMinutes >= onMinutes) && (currentMinutes < offMinutes);
}

// ===== LAYER 1 / LAYER 4: RTC + time_unknown =====

// True whenever the device does not trust its own clock, for either reason
// (RTC never had valid time, or the cached schedule failed its checksum).
// Layer 2 must not run while this is true.
bool isTimeUnknown() {
  return timeUnknownRtc || timeUnknownSchedule;
}

// Init the DS3231 over I2C (ESP32 default pins: SDA=21, SCL=22, see
// PINOUT.md). Sets rtcPresent + timeUnknownRtc. Must run before any relay
// GPIO is touched, since boot fail-safe behavior depends on its result.
//
// NOT VERIFIED ON HARDWARE - DS3231 module ordered but not arrived. Two
// things specifically need confirming once it's in hand: (1) that
// rtc.begin() actually returns false (rather than hanging or silently
// succeeding) when no DS3231 is on the bus, and (2) that lostPower()
// correctly reports true on a genuinely first-time/dead-battery chip. Both
// are documented RTClib behavior but unverified in this repo.
void initRtc() {
  Wire.begin();  // SDA=21, SCL=22 (ESP32 default I2C pins)

  if (!rtc.begin()) {
    Serial.println("[RTC] ERROR: DS3231 not found on I2C bus (SDA=21/SCL=22). "
                    "Staying in time_unknown until RTC hardware is present.");
    rtcPresent = false;
    timeUnknownRtc = true;
    return;
  }

  rtcPresent = true;

  if (rtc.lostPower()) {
    Serial.println("[RTC] DS3231 lostPower() == true (dead battery or first boot) - "
                    "no valid time. Entering time_unknown.");
    timeUnknownRtc = true;
  } else {
    timeUnknownRtc = false;
    DateTime now = rtc.now();
    Serial.print("[RTC] DS3231 time OK: ");
    Serial.print(now.year());  Serial.print("-");
    Serial.print(now.month()); Serial.print("-");
    Serial.print(now.day());   Serial.print(" ");
    Serial.print(now.hour());  Serial.print(":");
    Serial.println(now.minute());
  }
}

// Called periodically once WiFi is up: if NTP has produced a real time and
// we still don't trust the RTC, write NTP's time into the DS3231 and clear
// timeUnknownRtc. Writes LOCAL time (matching how the rest of this file
// already treats time via configTime()+TIMEZONE_OFFSET_SECONDS/localtime()),
// not UTC - intentional, since isTimeInScheduleWindow() only ever compares
// local wall-clock hour/minute, so there is no UTC/local conversion to get
// wrong anywhere else in the sketch as long as this stays consistent.
//
// Deliberately builds the DateTime from calendar fields (year/month/day/...)
// rather than a raw epoch integer - RTClib's DateTime(uint32_t) constructor
// takes seconds-since-2000, not seconds-since-1970, and time(nullptr)/NTP
// give seconds-since-1970. Passing one where the other is expected is a
// classic ~30-year-off bug; building from tm fields sidesteps it entirely.
// NOT VERIFIED ON HARDWARE - can't confirm rtc.adjust() actually lands
// correctly on real silicon until the DS3231 arrives.
void syncRtcFromNtpIfAvailable() {
  if (!rtcPresent) {
    return;  // nothing to write to
  }

  time_t now = time(nullptr);
  if (now < 24 * 3600) {
    return;  // NTP hasn't produced a real time yet
  }

  struct tm* timeinfo = localtime(&now);
  if (timeinfo == nullptr) {
    return;
  }

  rtc.adjust(DateTime(timeinfo->tm_year + 1900, timeinfo->tm_mon + 1, timeinfo->tm_mday,
                       timeinfo->tm_hour, timeinfo->tm_min, timeinfo->tm_sec));

  if (timeUnknownRtc) {
    timeUnknownRtc = false;
    Serial.println("[RTC] Real time fix received via NTP - RTC updated, clearing time_unknown (RTC half)");
  }
}

// Historical convention documented at the top of this file: pump fails
// safe ON (prevents float-mode overflow), everything else fails safe OFF.
// Used only as a fallback when a relay's config doesn't carry an explicit
// fail_safe_default (legacy NVS blob, or a backend that predates the field).
const char* defaultFailSafeForRelay(const char* relayName) {
  return (strcmp(relayName, "pump") == 0) ? "on" : "off";
}

// Copies a validated "on"/"off" value into a fail_safe_default field. Never
// trusts an unrecognized value into a safety-relevant field - falls back to
// "off" (the more conservative default for anything that isn't the pump).
void setFailSafeField(char* dest, const char* value) {
  bool valid = value != nullptr &&
               (strcmp(value, "on") == 0 || strcmp(value, "off") == 0);
  const char* v = valid ? value : "off";
  strncpy(dest, v, 3);
  dest[3] = 0;
}

// FNV-1a style mix, just enough to catch flash corruption of the cached
// schedule (Layer 4 trigger #2). Not a cryptographic checksum, doesn't need
// to be - the failure mode we're guarding against is bit rot / partial
// write, not tampering.
uint32_t computeScheduleChecksum(int onH, int onM, int offH, int offM, bool enabled) {
  uint32_t h = 2166136261UL;
  h = (h ^ (uint32_t)onH) * 16777619UL;
  h = (h ^ (uint32_t)onM) * 16777619UL;
  h = (h ^ (uint32_t)offH) * 16777619UL;
  h = (h ^ (uint32_t)offM) * 16777619UL;
  h = (h ^ (uint32_t)(enabled ? 1 : 0)) * 16777619UL;
  return h;
}

// ===== RELAY CONFIGURATION FUNCTIONS =====

// Find relay by name
int findRelayIndex(const char* relay_name) {
  for (int i = 0; i < relay_count; i++) {
    if (strcmp(relays[i].relay_name, relay_name) == 0) {
      return i;
    }
  }
  return -1;
}

// Get GPIO pin state based on active_level logic
bool getGPIOState(int relay_idx, const char* desiredState) {
  if (relay_idx < 0 || relay_idx >= relay_count) {
    return HIGH;  // Default: OFF
  }
  
  bool stateOn = (strcmp(desiredState, "on") == 0);
  const char* activeLevel = relays[relay_idx].active_level;
  
  if (strcmp(activeLevel, "LOW") == 0) {
    return stateOn ? LOW : HIGH;  // Active LOW
  } else {
    return stateOn ? HIGH : LOW;   // Active HIGH
  }
}

// Set relay GPIO and track state
void setRelayState(int relay_idx, const char* state) {
  if (relay_idx < 0 || relay_idx >= relay_count) {
    Serial.print("[Relay] ERROR: Invalid relay index ");
    Serial.println(relay_idx);
    return;
  }
  
  uint8_t pin = relays[relay_idx].gpio_pin;
  bool pinState = getGPIOState(relay_idx, state);
  
  digitalWrite(pin, pinState);
  relays[relay_idx].current_state = (strcmp(state, "on") == 0);
  relayStateChanged = true;
  
  Serial.print("[Relay] Set ");
  Serial.print(relays[relay_idx].relay_name);
  Serial.print(" (GPIO ");
  Serial.print(pin);
  Serial.print(") to ");
  Serial.println(state);
}

// Initialize GPIO for a relay
void initRelayGPIO(int relay_idx) {
  if (relay_idx < 0 || relay_idx >= relay_count) {
    return;
  }
  
  uint8_t pin = relays[relay_idx].gpio_pin;
  pinMode(pin, OUTPUT);
  
  // Set to OFF state (respects active_level)
  digitalWrite(pin, getGPIOState(relay_idx, "off"));
  relays[relay_idx].current_state = false;
  
  Serial.print("[Relay] GPIO initialized: ");
  Serial.print(relays[relay_idx].relay_name);
  Serial.print(" on pin ");
  Serial.print(pin);
  Serial.print(" (active-");
  Serial.print(relays[relay_idx].active_level);
  Serial.println(")");
}

// Load relay config from NVS (JSON string)
void loadRelayConfigFromNVS() {
  String configJson = preferences.getString("relays", "");
  
  if (configJson.length() == 0) {
    Serial.println("[Relay] No relay config in NVS, using defaults");
    setDefaultRelayConfig();
    return;
  }
  
  Serial.println("[Relay] Loading config from NVS...");
  
  // Parse JSON
  StaticJsonDocument<RELAY_CONFIG_JSON_MAX> doc;
  DeserializationError error = deserializeJson(doc, configJson);
  
  if (error) {
    Serial.print("[Relay] JSON parse error: ");
    Serial.println(error.c_str());
    Serial.println("[Relay] Falling back to defaults");
    setDefaultRelayConfig();
    return;
  }
  
  // Expect array format: [{"relay_name": "light", "gpio_pin": 4, "active_level": "LOW"}, ...]
  if (!doc.is<JsonArray>()) {
    Serial.println("[Relay] ERROR: Config is not an array");
    setDefaultRelayConfig();
    return;
  }
  
  relay_count = 0;
  JsonArray arr = doc.as<JsonArray>();
  
  for (JsonObject relayObj : arr) {
    if (relay_count >= MAX_RELAYS) {
      Serial.print("[Relay] WARNING: Too many relays (max ");
      Serial.print(MAX_RELAYS);
      Serial.println("), skipping rest");
      break;
    }
    
    const char* relayName = relayObj["relay_name"];
    uint8_t gpioPin = relayObj["gpio_pin"] | 255;
    const char* activeLevel = relayObj["active_level"];
    
    // Validate
    if (relayName == nullptr || gpioPin == 255 || activeLevel == nullptr) {
      Serial.println("[Relay] WARNING: Skipping relay with missing fields");
      continue;
    }
    
    if (gpioPin > 39) {
      Serial.print("[Relay] WARNING: Invalid GPIO ");
      Serial.print(gpioPin);
      Serial.println(", skipping");
      continue;
    }
    
    // Check for duplicate GPIO
    bool gpioConflict = false;
    for (int i = 0; i < relay_count; i++) {
      if (relays[i].gpio_pin == gpioPin) {
        Serial.print("[Relay] WARNING: Duplicate GPIO ");
        Serial.print(gpioPin);
        Serial.println(", skipping");
        gpioConflict = true;
        break;
      }
    }
    if (gpioConflict) continue;

    // fail_safe_default / cutoff_ceiling_seconds (Layer 3/4) - optional,
    // fall back to the historical pump-on/else-off convention and "no
    // ceiling" respectively when a legacy NVS blob doesn't have them.
    const char* failSafe = relayObj["fail_safe_default"] | defaultFailSafeForRelay(relayName);
    int ceilingSeconds = -1;
    if (relayObj.containsKey("cutoff_ceiling_seconds") && !relayObj["cutoff_ceiling_seconds"].isNull()) {
      long c = relayObj["cutoff_ceiling_seconds"].as<long>();
      if (c > 0) {
        ceilingSeconds = (int)c;
      }
    }

    // Add relay
    strncpy(relays[relay_count].relay_name, relayName, RELAY_NAME_MAX_LEN - 1);
    relays[relay_count].relay_name[RELAY_NAME_MAX_LEN - 1] = 0;
    relays[relay_count].gpio_pin = gpioPin;
    strncpy(relays[relay_count].active_level, activeLevel, 4);
    relays[relay_count].active_level[4] = 0;
    relays[relay_count].current_state = false;
    setFailSafeField(relays[relay_count].fail_safe_default, failSafe);
    relays[relay_count].cutoff_ceiling_seconds = ceilingSeconds;

    Serial.print("[Relay] Loaded: ");
    Serial.print(relayName);
    Serial.print(" on GPIO ");
    Serial.print(gpioPin);
    Serial.print(" (");
    Serial.print(activeLevel);
    Serial.println(")");
    
    relay_count++;
  }
  
  Serial.print("[Relay] Total relays loaded: ");
  Serial.println(relay_count);
}

// Set default relay configuration (light:D4, pump:D12)
void setDefaultRelayConfig() {
  relay_count = 0;

  // Light on GPIO 4 (D4)
  strncpy(relays[0].relay_name, "light", RELAY_NAME_MAX_LEN - 1);
  relays[0].gpio_pin = DEFAULT_LIGHT_GPIO;
  strncpy(relays[0].active_level, DEFAULT_ACTIVE_LEVEL, 4);
  relays[0].current_state = false;
  setFailSafeField(relays[0].fail_safe_default, "off");
  relays[0].cutoff_ceiling_seconds = -1;
  relay_count++;

  // Pump on GPIO 12 (D12)
  strncpy(relays[1].relay_name, "pump", RELAY_NAME_MAX_LEN - 1);
  relays[1].gpio_pin = DEFAULT_PUMP_GPIO;
  strncpy(relays[1].active_level, DEFAULT_ACTIVE_LEVEL, 4);
  relays[1].current_state = true;  // Pump ON by default (fail-safe)
  setFailSafeField(relays[1].fail_safe_default, "on");
  relays[1].cutoff_ceiling_seconds = -1;
  relay_count++;

  Serial.println("[Relay] Using default config: light (GPIO 4), pump (GPIO 12)");
}

// Save relay config to NVS as JSON
void saveRelayConfigToNVS() {
  StaticJsonDocument<RELAY_CONFIG_JSON_MAX> doc;
  JsonArray arr = doc.to<JsonArray>();

  for (int i = 0; i < relay_count; i++) {
    JsonObject relayObj = arr.createNestedObject();
    relayObj["relay_name"] = relays[i].relay_name;
    relayObj["gpio_pin"] = relays[i].gpio_pin;
    relayObj["active_level"] = relays[i].active_level;
    relayObj["fail_safe_default"] = relays[i].fail_safe_default;
    if (relays[i].cutoff_ceiling_seconds > 0) {
      relayObj["cutoff_ceiling_seconds"] = relays[i].cutoff_ceiling_seconds;
    } else {
      relayObj["cutoff_ceiling_seconds"] = nullptr;
    }
  }

  String configJson;
  serializeJson(doc, configJson);
  preferences.putString("relays", configJson);

  Serial.print("[Relay] Config saved to NVS: ");
  Serial.println(configJson);
}

// Force every relay directly to its fail_safe_default. Used unconditionally
// at boot (before Layer 2 gets a chance to run) and whenever the device is
// in time_unknown - this is a boot/state-entry action, not gated on Layer
// 3's timer at all.
void applyFailSafeDefaults() {
  for (int i = 0; i < relay_count; i++) {
    setRelayState(i, relays[i].fail_safe_default);
  }
}

// ===== LAYER 3: INDEPENDENT HARD-CUTOFF WATCHDOG =====
// Deliberately does NOT call runSchedule(), setRelayState(), or share any
// logic with the scheduler. It only reads relays[i].current_state (the one
// ground-truth flag every control path already writes when it changes a
// relay) and, past the ceiling, writes the GPIO pin directly itself using
// getGPIOState() (a pure lookup, not scheduler logic). A bug in Layer 2 -
// wrong time comparison, stuck "should be on" state, whatever - cannot
// disable this, because this code never trusts *why* a relay is on, only
// observes that it is and enforces the ceiling regardless.
void checkCutoffWatchdog() {
  unsigned long now = millis();

  for (int i = 0; i < relay_count; i++) {
    if (relays[i].cutoff_ceiling_seconds <= 0) {
      continue;  // no ceiling configured for this relay (e.g. pump/filter, fails open)
    }

    if (!relays[i].current_state) {
      // Relay is off right now - counter does not run. Reset defensively
      // in case a previous config swap left a stale value here.
      relayOnSinceMs[i] = 0;
      continue;
    }

    if (relayOnSinceMs[i] == 0) {
      // First tick where we observe this relay on - start counting now,
      // regardless of what turned it on (schedule, command, boot default).
      relayOnSinceMs[i] = now;
      continue;
    }

    unsigned long elapsedSeconds = (now - relayOnSinceMs[i]) / 1000UL;
    if (elapsedSeconds >= (unsigned long)relays[i].cutoff_ceiling_seconds) {
      uint8_t pin = relays[i].gpio_pin;
      digitalWrite(pin, getGPIOState(i, "off"));
      relays[i].current_state = false;
      relayOnSinceMs[i] = 0;
      relayStateChanged = true;

      Serial.print("[Watchdog] CUTOFF: forced ");
      Serial.print(relays[i].relay_name);
      Serial.print(" OFF after ");
      Serial.print(elapsedSeconds);
      Serial.println("s continuous-on (hard ceiling reached)");
    }
  }
}

// Publish all relay states to MQTT reported topic
void publishRelayState() {
  if (!mqttClient.connected()) {
    return;
  }
  
  StaticJsonDocument<256> doc;
  
  for (int i = 0; i < relay_count; i++) {
    doc[relays[i].relay_name] = relays[i].current_state ? "on" : "off";
  }
  
  char buffer[256];
  serializeJson(doc, buffer);
  
  mqttClient.publish(topicReported, buffer);
  
  Serial.print("[Relay] Reported state: ");
  Serial.println(buffer);
  
  relayStateChanged = false;
}

void updateStatusLED(bool wifiConnected, bool mqttConnected) {
  if (wifiConnected && mqttConnected) {
    digitalWrite(STATUS_LED_PIN, HIGH);  // Solid (both connected)
  } else if (wifiConnected) {
    digitalWrite(STATUS_LED_PIN, HIGH);  // Could implement pulse pattern here
  } else {
    digitalWrite(STATUS_LED_PIN, LOW);   // Off (no WiFi)
  }
}

// ===== SETUP =====
void setup() {
  Serial.begin(9600);
  delay(1000);
  
  Serial.println("\n\n=== TankCtl ESP32 Device Starting ===\n");
  
  // Seed random number generator
  randomSeed(analogRead(0));
  
  // Setup pins
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);  // Initially off
  
  // Initialize Preferences (NVS - Non-Volatile Storage)
  preferences.begin("tankctl", false);

  // Layer 1: RTC, before anything relay-related - the fail-safe boot logic
  // right below depends on whether we trust the clock yet.
  initRtc();

  // Load relay configuration from NVS
  loadRelayConfigFromNVS();

  // Initialize GPIO for all relays
  for (int i = 0; i < relay_count; i++) {
    initRelayGPIO(i);
  }

  // Load configuration (tank ID/secret + cached schedule; also runs the
  // Layer 4 checksum check on the cached schedule, setting
  // timeUnknownSchedule if it fails)
  loadConfig();

  // Every relay starts at its fail_safe_default, never at whatever GPIO
  // level it happened to power up in. This alone covers "no cached
  // schedule yet" for the light relay, and (together with the RTC check
  // above / schedule checksum check in loadConfig()) covers time_unknown -
  // this is a boot-time action, it does not wait for Layer 3's timer.
  applyFailSafeDefaults();
  if (isTimeUnknown()) {
    Serial.println("[Boot] time_unknown - relays held at fail_safe_default; "
                    "the light schedule will not run until a real time fix arrives");
  }

  // Build MQTT topics
  buildTopics();
  
  // Initialize temperature sensor (or random mode)
#if USE_RANDOM_TEMP
  Serial.println("Using RANDOM temperature mode (22-32°C) for testing");
#else
  sensors.begin();
  sensors.setResolution(TEMP_SENSOR_RESOLUTION_BITS);
  sensors.setWaitForConversion(false);
  sensors.requestTemperatures();
  tempRequestMs = millis();
  tempConversionInProgress = true;
  Serial.println("Using DS18B20 temperature sensor");
#endif
  
  // Configure WiFi
  WiFi.mode(WIFI_STA);
  connectWiFi();
  
  // Try device registration if needed (after WiFi connects)
  if (WiFi.status() == WL_CONNECTED) {
    if (!deviceRegistered) {
      registerDevice();
    }
    
    // Always try to sync schedule from API (even if registration failed)
    // This ensures we get the latest schedule even during partial outages
    syncScheduleFromAPI();
  }
  
  // Configure time via NTP
  configTime(TIMEZONE_OFFSET_SECONDS, 0, "pool.ntp.org", "time.nist.gov");
  Serial.print("Timezone: ");
  Serial.print(TIMEZONE_NAME);
  Serial.print(" (UTC+");
  Serial.print(TIMEZONE_OFFSET_SECONDS / 3600);
  Serial.println(":30)");
  Serial.println("Synchronizing time with NTP...");
  
  // Wait for time to be set (with timeout)
  time_t now = time(nullptr);
  int attempts = 0;
  while (now < 24 * 3600 && attempts < 20) {
    delay(500);
    Serial.print(".");
    now = time(nullptr);
    attempts++;
  }
  Serial.println();
  
  // Apply schedule immediately after NTP sync (boot-time recovery for power-loss scenarios)
  Serial.println("\n[Boot] Applying initial scheduled light state after NTP sync...");
  Serial.print("[Boot] scheduleEnabled=");
  Serial.print(scheduleEnabled ? "true" : "false");
  Serial.print(" on=");
  Serial.print(scheduleOnHour);
  Serial.print(":");
  Serial.print(scheduleOnMinute);
  Serial.print(" off=");
  Serial.print(scheduleOffHour);
  Serial.print(":");
  Serial.println(scheduleOffMinute);
  
  time_t nowTime = time(nullptr);
  struct tm* timeinfo = localtime(&nowTime);
  if (timeinfo != nullptr) {
    Serial.print("[Boot] Current time: ");
    Serial.print(timeinfo->tm_hour);
    Serial.print(":");
    Serial.println(timeinfo->tm_min);
  }

  // If NTP got a real time and we didn't trust the RTC yet, this is the
  // "real time fix" that can clear time_unknown (RTC half) - do it before
  // the boot-time runSchedule() call below so a first-boot device with a
  // dead/blank RTC can still recover to normal status in the same boot.
  syncRtcFromNtpIfAvailable();

  runSchedule();

  // Connect MQTT
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  
  if (WiFi.status() == WL_CONNECTED) {
    connectMQTT();
  }
  
  Serial.println("TankCtl ESP32 Device Ready\n");
}

// ===== MAIN LOOP =====
void loop() {
  unsigned long now = millis();
  bool wifiConnected = WiFi.status() == WL_CONNECTED;
  bool mqttConnected = mqttClient.connected();
  
  // Handle WiFi status changes
  if (wifiConnected != wasWifiConnected) {
    if (wifiConnected) {
      Serial.print("WiFi connected. IP: ");
      Serial.println(WiFi.localIP());
      lastMqttRetryMs = 0;  // Reset MQTT retry timer
    } else {
      Serial.println("WiFi disconnected");
      if (mqttConnected) {
        mqttClient.disconnect();
      }
    }
    wasWifiConnected = wifiConnected;
  }
  
  // Update LED status
  updateStatusLED(wifiConnected, mqttConnected);
  
  // WiFi reconnection
  if (!wifiConnected) {
    if (now - lastWifiRetryMs >= WIFI_RETRY_INTERVAL_MS) {
      lastWifiRetryMs = now;
      connectWiFi();
    }
  }
  
  // MQTT handling
  if (wifiConnected) {
    if (!mqttConnected) {
      if (now - lastMqttRetryMs >= MQTT_RETRY_INTERVAL_MS) {
        lastMqttRetryMs = now;
        connectMQTT();
      }
    } else {
      mqttClient.loop();
    }
  }
  
  // NTP time update
  if (now - lastNtpUpdateMs >= NTP_UPDATE_INTERVAL_MS) {
    lastNtpUpdateMs = now;
    configTime(TIMEZONE_OFFSET_SECONDS, 0, "pool.ntp.org", "time.nist.gov");
  }

  // Run scheduler (Layer 2) - reads the RTC, never blocks on network
  if (now - lastScheduleCheckMs >= SCHEDULE_CHECK_INTERVAL_MS) {
    lastScheduleCheckMs = now;
    runSchedule();

    // While we don't trust the RTC, retry the NTP->RTC fix every tick
    // instead of waiting for the once-an-hour resync above - recovering
    // from time_unknown shouldn't have to wait up to an hour.
    if (timeUnknownRtc && wifiConnected) {
      syncRtcFromNtpIfAvailable();
    }
  }

  // Run the hard-cutoff watchdog (Layer 3) - own timer, own code path,
  // completely independent of the scheduler above.
  if (now - lastWatchdogCheckMs >= WATCHDOG_CHECK_INTERVAL_MS) {
    lastWatchdogCheckMs = now;
    checkCutoffWatchdog();
  }

  // Publish telemetry
  if (now - lastTelemetryMs >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryMs = now;
    publishTelemetry();
  }
  
  // Publish heartbeat
  if (now - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatMs = now;
    publishHeartbeat();
  }
  
  // Publish relay state if changed
  if (relayStateChanged && mqttClient.connected()) {
    publishRelayState();
  }
  
  // Health log
  if (now - lastHealthLogMs >= HEALTH_LOG_INTERVAL_MS) {
    lastHealthLogMs = now;
    Serial.print("Health: uptime_ms=");
    Serial.print(now);
    Serial.print(" wifi=");
    Serial.print(wifiConnected ? "connected" : "disconnected");
    Serial.print(" mqtt=");
    Serial.print(mqttConnected ? "connected" : "disconnected");
    Serial.print(" rssi=");
    Serial.println(wifiConnected ? WiFi.RSSI() : 0);
  }
  
  delay(1);
}

// ===== WIFI FUNCTIONS =====
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }
  
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);
  
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  Serial.println();
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi connected. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi connection failed");
  }
}

// ===== MQTT FUNCTIONS =====
void connectMQTT() {
  if (mqttClient.connected()) {
    return;
  }
  
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Skipping MQTT connect: WiFi not connected");
    return;
  }
  
  char clientId[48];
  snprintf(clientId, sizeof(clientId), "tankctl-esp32-%s", tankId);

  Serial.print("Connecting to MQTT broker: ");
  Serial.print(MQTT_SERVER);
  Serial.print(":");
  Serial.println(MQTT_PORT);

  // Per-device username/password (secrets.h) - the broker no longer accepts
  // anonymous connections (see Track 2/C of the fail-safe relay stack spec).
  if (mqttClient.connect(clientId, MQTT_USERNAME, MQTT_PASSWORD)) {
    Serial.println("MQTT connected");
    
    // Subscribe to command topic
    mqttClient.subscribe(topicCommand);
    Serial.print("Subscribed to: ");
    Serial.println(topicCommand);
    
    // Subscribe to config topic
    mqttClient.subscribe(topicConfig);
    Serial.print("Subscribed to: ");
    Serial.println(topicConfig);
    
    // Publish initial states
    publishHeartbeat();
    publishRelayState();
  } else {
    Serial.print("MQTT connection failed, rc=");
    Serial.println(mqttClient.state());
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.print("Message received on: ");
  Serial.println(topic);
  
  // Route to appropriate handler
  if (strcmp(topic, topicCommand) == 0) {
    handleCommandMessage(payload, length);
  } else if (strcmp(topic, topicConfig) == 0) {
    handleConfigMessage(payload, length);
  } else {
    Serial.print("Unknown topic: ");
    Serial.println(topic);
  }
}

void handleCommandMessage(byte* payload, unsigned int length) {
  // Parse JSON
  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, payload, length);
  
  if (error) {
    Serial.print("JSON parse failed: ");
    Serial.println(error.c_str());
    return;
  }
  
  handleCommand(doc);
}

void handleConfigMessage(byte* payload, unsigned int length) {
  Serial.println("[Config] Received config message");
  
  // Bounds check
  if (length >= RELAY_CONFIG_JSON_MAX) {
    Serial.print("[Config] ERROR: Payload too large (");
    Serial.print(length);
    Serial.print(" >= ");
    Serial.print(RELAY_CONFIG_JSON_MAX);
    Serial.println(")");
    return;
  }
  
  // Parse JSON config
  StaticJsonDocument<RELAY_CONFIG_JSON_MAX> doc;
  DeserializationError error = deserializeJson(doc, payload, length);
  
  if (error) {
    Serial.print("[Config] JSON parse failed: ");
    Serial.println(error.c_str());
    return;
  }
  
  // Expect format: {"relays": [...]}
  if (!doc.containsKey("relays")) {
    Serial.println("[Config] ERROR: Missing 'relays' field");
    return;
  }
  
  JsonArray relayArray = doc["relays"];
  if (relayArray.isNull()) {
    Serial.println("[Config] ERROR: 'relays' is not an array");
    return;
  }
  
  // Validate new config
  int newCount = 0;
  RelayPin tempRelays[MAX_RELAYS];
  
  for (JsonObject relayObj : relayArray) {
    if (newCount >= MAX_RELAYS) {
      Serial.print("[Config] WARNING: Too many relays (max ");
      Serial.print(MAX_RELAYS);
      Serial.println(")");
      break;
    }
    
    const char* relayName = relayObj["relay_name"];
    uint8_t gpioPin = relayObj["gpio_pin"] | 255;
    const char* activeLevel = relayObj["active_level"];
    
    // Validate fields
    if (relayName == nullptr || gpioPin == 255 || activeLevel == nullptr) {
      Serial.println("[Config] WARNING: Skipping relay with missing fields");
      continue;
    }
    
    // Validate GPIO pin
    if (gpioPin > 39) {
      Serial.print("[Config] ERROR: Invalid GPIO pin ");
      Serial.print(gpioPin);
      Serial.print(" (must be 0-39)");
      Serial.println();
      continue;
    }
    
    // Check for duplicate GPIO
    bool gpioConflict = false;
    for (int i = 0; i < newCount; i++) {
      if (tempRelays[i].gpio_pin == gpioPin) {
        Serial.print("[Config] ERROR: Duplicate GPIO pin ");
        Serial.println(gpioPin);
        gpioConflict = true;
        break;
      }
    }
    if (gpioConflict) continue;
    
    // Check for duplicate name
    bool nameConflict = false;
    for (int i = 0; i < newCount; i++) {
      if (strcmp(tempRelays[i].relay_name, relayName) == 0) {
        Serial.print("[Config] ERROR: Duplicate relay name ");
        Serial.println(relayName);
        nameConflict = true;
        break;
      }
    }
    if (nameConflict) continue;

    // fail_safe_default / cutoff_ceiling_seconds (Layer 3/4) - optional,
    // same fallback rules as loadRelayConfigFromNVS().
    const char* failSafe = relayObj["fail_safe_default"] | defaultFailSafeForRelay(relayName);
    int ceilingSeconds = -1;
    if (relayObj.containsKey("cutoff_ceiling_seconds") && !relayObj["cutoff_ceiling_seconds"].isNull()) {
      long c = relayObj["cutoff_ceiling_seconds"].as<long>();
      if (c > 0) {
        ceilingSeconds = (int)c;
      }
    }

    // Add to temp config
    strncpy(tempRelays[newCount].relay_name, relayName, RELAY_NAME_MAX_LEN - 1);
    tempRelays[newCount].relay_name[RELAY_NAME_MAX_LEN - 1] = 0;
    tempRelays[newCount].gpio_pin = gpioPin;
    strncpy(tempRelays[newCount].active_level, activeLevel, 4);
    tempRelays[newCount].active_level[4] = 0;
    tempRelays[newCount].current_state = false;
    setFailSafeField(tempRelays[newCount].fail_safe_default, failSafe);
    tempRelays[newCount].cutoff_ceiling_seconds = ceilingSeconds;

    Serial.print("[Config] Validated: ");
    Serial.print(relayName);
    Serial.print(" on GPIO ");
    Serial.println(gpioPin);
    
    newCount++;
  }
  
  if (newCount == 0) {
    Serial.println("[Config] ERROR: No valid relays in config");
    return;
  }
  
  // Apply new config
  relay_count = newCount;
  for (int i = 0; i < relay_count; i++) {
    relays[i] = tempRelays[i];
    initRelayGPIO(i);
    // Land on fail_safe_default rather than the hardcoded "off" that
    // initRelayGPIO() just wrote - if this is the light relay and a
    // schedule is already cached, the next 1s Layer 2 tick corrects it;
    // if not, this is exactly where it should sit until one arrives.
    setRelayState(i, relays[i].fail_safe_default);
  }

  // A relay's identity/position may have changed - clear Layer 3's
  // watchdog counters so a stale timer never gets attributed to the wrong
  // relay at the same array index.
  memset(relayOnSinceMs, 0, sizeof(relayOnSinceMs));

  // Save to NVS
  saveRelayConfigToNVS();
  
  Serial.print("[Config] Applied ");
  Serial.print(relay_count);
  Serial.println(" relays");
  
  // Report new state
  publishRelayState();
}

void buildTopics() {
  snprintf(topicCommand, sizeof(topicCommand), "tankctl/%s/command", tankId);
  snprintf(topicReported, sizeof(topicReported), "tankctl/%s/reported", tankId);
  snprintf(topicTelemetry, sizeof(topicTelemetry), "tankctl/%s/telemetry", tankId);
  snprintf(topicHeartbeat, sizeof(topicHeartbeat), "tankctl/%s/heartbeat", tankId);
  snprintf(topicStatus,    sizeof(topicStatus),    "tankctl/%s/status",    tankId);
  snprintf(topicConfig,    sizeof(topicConfig),    "tankctl/%s/config",    tankId);
}

// ===== COMMAND HANDLER =====
void handleCommand(JsonDocument& doc) {
  if (!doc.containsKey("version") || !doc.containsKey("command")) {
    Serial.println("Invalid command: missing version or command");
    return;
  }
  
  int version = doc["version"];
  const char* command = doc["command"];
  
  // Check version to prevent duplicate execution
  if (version <= lastCommandVersion) {
    Serial.print("Ignoring old command version: ");
    Serial.println(version);
    return;
  }
  
  lastCommandVersion = version;
  Serial.print("Executing command: ");
  Serial.print(command);
  Serial.print(" (version ");
  Serial.print(version);
  Serial.println(")");
  
  if (strcmp(command, "set_light") == 0) {
    handleSetLight(doc);
  } else if (strcmp(command, "set_pump") == 0) {
    handleSetPump(doc);
  } else if (strcmp(command, "set_relay") == 0) {
    handleSetRelay(doc);
  } else if (strcmp(command, "set_schedule") == 0) {
    handleSetSchedule(doc);
  } else if (strcmp(command, "reboot_device") == 0) {
    handleRebootDevice();
  } else if (strncmp(command, "set_", 4) == 0) {
    // Generic "set_<relay_name>" commands (e.g. "set_heater") — the backend's
    // shadow reconciliation names commands this way for any relay beyond
    // light/pump, rather than using the "set_relay" + relay_name field form.
    handleSetNamedRelay(command + 4, doc);
  } else {
    Serial.print("Unknown command: ");
    Serial.println(command);
  }
}

void handleSetLight(JsonDocument& doc) {
  if (!doc.containsKey("value")) {
    Serial.println("set_light: missing value");
    return;
  }
  
  const char* value = doc["value"];
  int lightIdx = findRelayIndex("light");
  
  if (lightIdx < 0) {
    Serial.println("set_light: 'light' relay not found");
    return;
  }
  
  setRelayState(lightIdx, value);
  publishRelayState();
}

void handleSetPump(JsonDocument& doc) {
  if (!doc.containsKey("value")) {
    Serial.println("set_pump: missing value");
    return;
  }
  
  const char* value = doc["value"];
  int pumpIdx = findRelayIndex("pump");
  
  if (pumpIdx < 0) {
    Serial.println("set_pump: 'pump' relay not found");
    return;
  }
  
  setRelayState(pumpIdx, value);
  publishRelayState();
}

// Look up a relay by name and, if found, set its state and report it.
// Shared by both relay-command dispatch paths: "set_relay" (relay_name +
// value fields) and the generic "set_<relay_name>" (value field only).
void applyRelayValue(const char* relayName, const char* value) {
  int relayIdx = findRelayIndex(relayName);

  if (relayIdx < 0) {
    Serial.print("Relay '");
    Serial.print(relayName);
    Serial.println("' not found");
    return;
  }

  setRelayState(relayIdx, value);
  publishRelayState();
}

void handleSetRelay(JsonDocument& doc) {
  if (!doc.containsKey("relay_name") || !doc.containsKey("value")) {
    Serial.println("set_relay: missing relay_name or value");
    return;
  }

  const char* relayName = doc["relay_name"];
  const char* value = doc["value"];
  applyRelayValue(relayName, value);
}

void handleSetNamedRelay(const char* relayName, JsonDocument& doc) {
  if (!doc.containsKey("value")) {
    Serial.print("set_");
    Serial.print(relayName);
    Serial.println(": missing value");
    return;
  }

  const char* value = doc["value"];
  applyRelayValue(relayName, value);
}

void handleSetSchedule(JsonDocument& doc) {
  if (!doc.containsKey("on_time") || !doc.containsKey("off_time")) {
    Serial.println("set_schedule: missing on_time or off_time");
    return;
  }
  
  const char* onTime = doc["on_time"];
  const char* offTime = doc["off_time"];
  
  // Parse on_time (format: "HH:MM")
  int onHour, onMinute;
  if (sscanf(onTime, "%d:%d", &onHour, &onMinute) != 2) {
    Serial.println("set_schedule: invalid on_time format");
    return;
  }
  
  // Parse off_time
  int offHour, offMinute;
  if (sscanf(offTime, "%d:%d", &offHour, &offMinute) != 2) {
    Serial.println("set_schedule: invalid off_time format");
    return;
  }
  
  // Update schedule
  scheduleOnHour = onHour;
  scheduleOnMinute = onMinute;
  scheduleOffHour = offHour;
  scheduleOffMinute = offMinute;
  scheduleEnabled = true;
  
  // Save to Preferences
  saveSchedule();

  Serial.print("Schedule updated: ON ");
  Serial.print(onTime);
  Serial.print(", OFF ");
  Serial.println(offTime);
  
  // Apply new schedule immediately
  runSchedule();
}

void handleRebootDevice() {
  Serial.println("Reboot command received");
  
  // Publish final state before reset
  publishRelayState();
  publishHeartbeat();
  
  // Give MQTT a window to flush
  unsigned long flushStart = millis();
  while (millis() - flushStart < 300) {
    mqttClient.loop();
    delay(10);
  }
  
  Serial.println("Rebooting now...");
  Serial.flush();
  delay(100);
  
  // ESP32 reboot
  ESP.restart();
}

// ===== TDS SENSOR =====
// Reads the analog TDS probe and converts to ppm. Returns -1 if the ADC
// reading is out of a plausible range (probe disconnected/shorted).
float readTdsPpm() {
  int raw = analogRead(TDS_PIN);
  if (raw <= 0 || raw >= 4095) {
    return -1.0f;
  }
  float voltage = (raw / 4095.0f) * 3.3f;
  return voltage * 1000.0f * TDS_CALIBRATION_FACTOR;
}

// ===== TELEMETRY =====
void publishTelemetry() {
  if (!mqttClient.connected()) {
    return;
  }
  
#if USE_RANDOM_TEMP
  // Generate random temperature for testing (no sensor required)
  static unsigned long lastRandomTempMs = 0;
  unsigned long now = millis();
  
  if (now - lastRandomTempMs >= TELEMETRY_INTERVAL_MS) {
    lastRandomTempMs = now;
    
    // Generate random float between TEMP_MIN and TEMP_MAX
    float randTemp = TEMP_MIN + (random(0, 1000) / 1000.0f) * (TEMP_MAX - TEMP_MIN);
    temperature = randTemp;
    tdsPpm = readTdsPpm();

    Serial.print("Telemetry (random): temp=");
    Serial.print(temperature);
    Serial.print("°C tds=");
    Serial.println(tdsPpm);

    StaticJsonDocument<128> doc;
    doc["temperature"] = temperature;
    if (tdsPpm >= 0) {
      doc["tds"] = tdsPpm;
    }

    char buffer[128];
    serializeJson(doc, buffer);

    mqttClient.publish(topicTelemetry, buffer);
  }
#else
  // Use real DS18B20 sensor
  if (!tempConversionInProgress) {
    sensors.requestTemperatures();
    tempRequestMs = millis();
    tempConversionInProgress = true;
    return;
  }
  
  unsigned long now = millis();
  if (now - tempRequestMs < TEMP_CONVERSION_DELAY_MS) {
    return;
  }
  
  // Read completed conversion
  float tempReading = sensors.getTempCByIndex(0);
  sensors.requestTemperatures();
  tempRequestMs = now;
  tempConversionInProgress = true;
  
  // Validate sensor reading
  StaticJsonDocument<128> doc;
  bool sensorValid = !(tempReading == DEVICE_DISCONNECTED_C ||
                       tempReading < -55.0 || tempReading > 125.0);
  
  if (sensorValid) {
    temperature = tempReading;
    Serial.print("Telemetry: temp=");
    Serial.print(temperature);
    Serial.println("°C");
  } else {
    temperature = 0;
    Serial.println("Telemetry: sensor unavailable, sending temperature=0");
    
    // Publish warning
    StaticJsonDocument<128> warnDoc;
    warnDoc["event"]   = "warning";
    warnDoc["code"]    = "sensor_unavailable";
    warnDoc["message"] = "Temperature sensor not connected or reading invalid";
    char warnBuf[128];
    serializeJson(warnDoc, warnBuf);
    mqttClient.publish(topicStatus, warnBuf);
  }

  tdsPpm = readTdsPpm();
  if (tdsPpm < 0) {
    Serial.println("Telemetry: TDS sensor unavailable, omitting tds field");

    StaticJsonDocument<128> warnDoc;
    warnDoc["event"]   = "warning";
    warnDoc["code"]    = "tds_sensor_unavailable";
    warnDoc["message"] = "TDS sensor not connected or reading invalid";
    char warnBuf[128];
    serializeJson(warnDoc, warnBuf);
    mqttClient.publish(topicStatus, warnBuf);
  }

  doc["temperature"] = temperature;
  if (tdsPpm >= 0) {
    doc["tds"] = tdsPpm;
  }

  char buffer[128];
  serializeJson(doc, buffer);

  mqttClient.publish(topicTelemetry, buffer);
#endif
}

void publishHeartbeat() {
  if (!mqttClient.connected()) {
    return;
  }
  
  StaticJsonDocument<128> doc;
  // Layer 4: distinct status while the device doesn't trust its own clock -
  // lets the backend tell "up but clock-blind" apart from "up and fine."
  doc["status"] = isTimeUnknown() ? "time_unknown" : "online";
  doc["uptime_ms"] = millis();
  doc["rssi"] = WiFi.RSSI();
  doc["firmware_version"] = FIRMWARE_VERSION;
  doc["chip"] = "ESP32";
  doc["free_heap"] = ESP.getFreeHeap();
  
  char buffer[128];
  serializeJson(doc, buffer);
  
  mqttClient.publish(topicHeartbeat, buffer);
  
  Serial.println("Heartbeat sent");
}

// ===== LAYER 2: LOCAL SCHEDULE ENGINE =====
// Ticks every ~1s from loop(). Reads time from the DS3231 RTC directly -
// never system/NTP time - so this keeps working correctly even if Wi-Fi/
// MQTT has been down for hours. Never blocks on network.
void runSchedule() {
  if (isTimeUnknown()) {
    // Do not guess. Relays are already held at fail_safe_default (applied
    // at boot / on entry to time_unknown) - stay there until a real time
    // fix arrives (see syncRtcFromNtpIfAvailable() / saveSchedule()).
    return;
  }

  if (!scheduleEnabled) {
    // No cached schedule yet - already at fail_safe_default, nothing to
    // reconcile against. Silent - no need to log every second.
    return;
  }

  if (!rtcPresent) {
    // Shouldn't happen (isTimeUnknown() covers this via timeUnknownRtc),
    // but never fall back to system/NTP time here - that would defeat the
    // entire point of Layer 2 being network-independent.
    return;
  }

  DateTime nowRtc = rtc.now();
  int currentHour = nowRtc.hour();
  int currentMinute = nowRtc.minute();

  // Keep light aligned with schedule window so power-loss reboots recover state.
  bool shouldBeOn = isTimeInScheduleWindow(currentHour, currentMinute);
  
  int lightIdx = findRelayIndex("light");
  if (lightIdx < 0) {
    return;  // Light relay not configured
  }
  
  bool lightCurrentlyOn = relays[lightIdx].current_state;
  
  // Only log state changes, not every check
  if (lightCurrentlyOn != shouldBeOn) {
    if (shouldBeOn) {
      Serial.println("[Schedule] APPLY: Lights should be ON (within window)");
    } else {
      Serial.println("[Schedule] APPLY: Lights should be OFF (outside window)");
    }
    
    setRelayState(lightIdx, shouldBeOn ? "on" : "off");
    publishRelayState();

    Serial.print("[Schedule] Relay applied: light=");
    Serial.println(shouldBeOn ? "on" : "off");
  }
}

// ===== PREFERENCES (NVS Storage) =====
void loadConfig() {
  // Load tank ID
  String savedTankId = preferences.getString("tank_id", DEFAULT_TANK_ID);
  strncpy(tankId, savedTankId.c_str(), TANK_ID_MAX_LEN - 1);
  tankId[TANK_ID_MAX_LEN - 1] = 0;
  
  // Load device secret (if exists, device is registered)
  String savedSecret = preferences.getString("device_secret", "");
  if (savedSecret.length() > 0) {
    strncpy(deviceSecret, savedSecret.c_str(), DEVICE_SECRET_MAX_LEN - 1);
    deviceSecret[DEVICE_SECRET_MAX_LEN - 1] = 0;
    deviceRegistered = true;
    Serial.println("Device already registered (secret found in NVS)");
  } else {
    deviceRegistered = false;
    Serial.println("Device not registered yet (no secret in NVS)");
  }
  
  // Load schedule
  scheduleOnHour = preferences.getInt("sched_on_h", 18);
  scheduleOnMinute = preferences.getInt("sched_on_m", 0);
  scheduleOffHour = preferences.getInt("sched_off_h", 6);
  scheduleOffMinute = preferences.getInt("sched_off_m", 0);
  scheduleEnabled = preferences.getBool("sched_enabled", false);

  // Layer 4: schedule integrity check. "sched_valid" is only true once a
  // schedule has genuinely been saved at least once (saveSchedule() sets
  // it) - a brand-new device with nothing cached yet is NOT a checksum
  // failure, it's just unconfigured (Layer 2 already handles that via
  // scheduleEnabled == false -> fail_safe_default). A checksum mismatch on
  // a schedule that WAS saved before means flash corruption - that's the
  // real Layer 4 trigger.
  bool schedValid = preferences.getBool("sched_valid", false);
  if (schedValid) {
    uint32_t storedChecksum = preferences.getUInt("sched_chk", 0);
    uint32_t computedChecksum = computeScheduleChecksum(
        scheduleOnHour, scheduleOnMinute, scheduleOffHour, scheduleOffMinute, scheduleEnabled);
    if (storedChecksum != computedChecksum) {
      timeUnknownSchedule = true;
      Serial.println("[Schedule] ERROR: cached schedule failed checksum - entering time_unknown");
    } else {
      timeUnknownSchedule = false;
    }
  } else {
    timeUnknownSchedule = false;  // nothing cached yet - not a corruption case
  }

  Serial.print("Loaded config from NVS. Tank ID: ");
  Serial.println(tankId);
  Serial.print("Schedule: ");
  Serial.print(scheduleOnHour);
  Serial.print(":");
  Serial.print(scheduleOnMinute);
  Serial.print(" - ");
  Serial.print(scheduleOffHour);
  Serial.print(":");
  Serial.print(scheduleOffMinute);
  Serial.print(" (");
  Serial.print(scheduleEnabled ? "enabled" : "disabled");
  Serial.println(")");
}

void saveSchedule() {
  preferences.putInt("sched_on_h", scheduleOnHour);
  preferences.putInt("sched_on_m", scheduleOnMinute);
  preferences.putInt("sched_off_h", scheduleOffHour);
  preferences.putInt("sched_off_m", scheduleOffMinute);
  preferences.putBool("sched_enabled", scheduleEnabled);

  uint32_t checksum = computeScheduleChecksum(
      scheduleOnHour, scheduleOnMinute, scheduleOffHour, scheduleOffMinute, scheduleEnabled);
  preferences.putUInt("sched_chk", checksum);
  preferences.putBool("sched_valid", true);

  // A schedule we just computed the checksum for ourselves is, by
  // definition, internally consistent - this is the "fresh config push
  // confirms schedule integrity" exit condition for time_unknown's
  // schedule half (the RTC half, if also unresolved, still holds relays at
  // fail_safe_default via isTimeUnknown() until NTP fixes that separately).
  if (timeUnknownSchedule) {
    timeUnknownSchedule = false;
    Serial.println("[Schedule] Fresh schedule saved - clearing time_unknown (schedule half)");
  }

  Serial.println("Schedule saved to NVS");
}

// ===== DEVICE REGISTRATION =====
void registerDevice() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[Registration] WiFi not connected, skipping registration");
    return;
  }
  
  if (deviceRegistered && strlen(deviceSecret) > 0) {
    Serial.println("[Registration] Device already registered with secret");
    return;
  }
  
  Serial.println("\n[Registration] Starting device registration...");
  Serial.print("[Registration] Tank ID: ");
  Serial.println(tankId);
  
  // Create HTTP request
  WiFiClient httpClient;
  
  if (!httpClient.connect(REGISTRATION_SERVER, REGISTRATION_PORT)) {
    Serial.print("[Registration] Failed to connect to ");
    Serial.print(REGISTRATION_SERVER);
    Serial.print(":");
    Serial.println(REGISTRATION_PORT);
    return;
  }
  
  Serial.print("[Registration] Connected to ");
  Serial.print(REGISTRATION_SERVER);
  Serial.print(":");
  Serial.println(REGISTRATION_PORT);
  
  // Build JSON payload using bounded buffer
  static char payload[256];
  StaticJsonDocument<128> requestDoc;
  requestDoc["device_id"] = tankId;
  serializeJson(requestDoc, payload, sizeof(payload));
  
  // Build HTTP request using snprintf (no String class!)
  static char request[512];
  int payloadLen = strlen(payload);
  snprintf(request, sizeof(request),
    "POST %s HTTP/1.1\r\n"
    "Host: %s:%d\r\n"
    "Content-Type: application/json\r\n"
    "Content-Length: %d\r\n"
    "Connection: close\r\n"
    "\r\n"
    "%s",
    REGISTRATION_ENDPOINT,
    REGISTRATION_SERVER,
    REGISTRATION_PORT,
    payloadLen,
    payload);
  
  Serial.print("[Registration] Sending request... ");
  httpClient.print(request);
  Serial.println("done");
  
  // Wait for response (bounded buffer, no String fragmentation)
  unsigned long timeout = millis() + 5000;  // 5 second timeout
  static char response[2048];
  int responseLen = 0;
  
  while (httpClient.connected() || httpClient.available()) {
    if (millis() > timeout) {
      Serial.println("[Registration] Response timeout");
      break;
    }
    
    if (httpClient.available() && responseLen < (int)(sizeof(response) - 1)) {
      char c = httpClient.read();
      response[responseLen++] = c;
    }
    delay(1);
  }
  response[responseLen] = '\0';
  
  httpClient.stop();
  
  // Extract HTTP status code from response
  int statusCode = 200;
  const char* statusCodeStr = strstr(response, "HTTP/1.1");
  if (statusCodeStr != nullptr) {
    sscanf(statusCodeStr, "HTTP/1.1 %d", &statusCode);
  }
  
  Serial.print("[Registration] HTTP Status: ");
  Serial.println(statusCode);
  
  // Parse response
  if (responseLen > 0) {
    // Find JSON part (skip HTTP headers)
    const char* jsonStart = strstr(response, "\r\n\r\n");
    if (jsonStart != nullptr) {
      jsonStart += 4;  // Skip "\r\n\r\n"
      
      Serial.print("[Registration] Raw response: ");
      Serial.println(jsonStart);
      
      StaticJsonDocument<512> responseDoc;
      DeserializationError error = deserializeJson(responseDoc, jsonStart);
      
      if (!error) {
        if (statusCode == 409) {
          // Device already registered - mark as registered without secret
          Serial.println("[Registration] ✓ Device already registered on backend (409 Conflict)");
          deviceRegistered = true;
        } else if (responseDoc.containsKey("device_secret")) {
          const char* secret = responseDoc["device_secret"];
          strncpy(deviceSecret, secret, DEVICE_SECRET_MAX_LEN - 1);
          deviceSecret[DEVICE_SECRET_MAX_LEN - 1] = 0;
          
          // Save to NVS
          preferences.putString("device_secret", secret);
          deviceRegistered = true;
          
          Serial.println("[Registration] ✓ Device registered successfully!");
          Serial.print("[Registration] Device Secret (first 16 chars): ");
          for (int i = 0; i < 16 && secret[i] != '\0'; i++) {
            Serial.print(secret[i]);
          }
          Serial.println("...");
        } else {
          Serial.println("[Registration] ✗ Unexpected response (no device_secret)");
          Serial.print("[Registration] Keys in response: ");
          for (JsonPair p : responseDoc.as<JsonObject>()) {
            Serial.print(p.key().c_str());
            Serial.print(" ");
          }
          Serial.println();
        }
      } else {
        Serial.print("[Registration] ✗ JSON parse error: ");
        Serial.println(error.c_str());
      }
    } else {
      Serial.println("[Registration] ✗ No JSON found in response");
    }
  } else {
    Serial.println("[Registration] ✗ Empty response from server");
  }
  
  Serial.println();
}

// ===== SCHEDULE SYNC FROM API =====
void syncScheduleFromAPI() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[Schedule Sync] WiFi not connected, skipping");
    return;
  }
  
  Serial.println("\n[Schedule Sync] Starting schedule sync from API...");
  Serial.print("[Schedule Sync] Tank ID: ");
  Serial.println(tankId);
  
  // Create HTTP request
  WiFiClient httpClient;
  
  if (!httpClient.connect(REGISTRATION_SERVER, REGISTRATION_PORT)) {
    Serial.print("[Schedule Sync] Failed to connect to ");
    Serial.print(REGISTRATION_SERVER);
    Serial.print(":");
    Serial.println(REGISTRATION_PORT);
    return;
  }
  
  Serial.print("[Schedule Sync] Connected to ");
  Serial.print(REGISTRATION_SERVER);
  Serial.print(":");
  Serial.println(REGISTRATION_PORT);
  
  // Build HTTP GET request for schedule endpoint
  static char request[256];
  snprintf(request, sizeof(request),
    "GET /devices/%s/schedule HTTP/1.1\r\n"
    "Host: %s:%d\r\n"
    "Connection: close\r\n"
    "\r\n",
    tankId,
    REGISTRATION_SERVER,
    REGISTRATION_PORT);
  
  Serial.print("[Schedule Sync] Sending request... ");
  httpClient.print(request);
  Serial.println("done");
  
  // Wait for response (bounded buffer)
  unsigned long timeout = millis() + 5000;  // 5 second timeout
  static char response[2048];
  int responseLen = 0;
  
  while (httpClient.connected() || httpClient.available()) {
    if (millis() > timeout) {
      Serial.println("[Schedule Sync] Response timeout");
      break;
    }
    
    if (httpClient.available() && responseLen < (int)(sizeof(response) - 1)) {
      char c = httpClient.read();
      response[responseLen++] = c;
    }
    delay(1);
  }
  response[responseLen] = '\0';
  
  httpClient.stop();
  
  // Extract HTTP status code
  int statusCode = 200;
  const char* statusCodeStr = strstr(response, "HTTP/1.1");
  if (statusCodeStr != nullptr) {
    sscanf(statusCodeStr, "HTTP/1.1 %d", &statusCode);
  }
  
  Serial.print("[Schedule Sync] HTTP Status: ");
  Serial.println(statusCode);
  
  // Parse response
  if (responseLen > 0) {
    // Find JSON part (skip HTTP headers)
    const char* jsonStart = strstr(response, "\r\n\r\n");
    if (jsonStart != nullptr) {
      jsonStart += 4;  // Skip "\r\n\r\n"
      
      Serial.print("[Schedule Sync] Raw response: ");
      Serial.println(jsonStart);
      
      StaticJsonDocument<256> scheduleDoc;
      DeserializationError error = deserializeJson(scheduleDoc, jsonStart);
      
      if (!error && statusCode == 200) {
        if (scheduleDoc.containsKey("on_time") && 
            scheduleDoc.containsKey("off_time") && 
            scheduleDoc.containsKey("enabled")) {
          
          const char* onTimeStr = scheduleDoc["on_time"];
          const char* offTimeStr = scheduleDoc["off_time"];
          bool enabled = scheduleDoc["enabled"];
          
          // Parse on_time (format: "HH:MM")
          int newOnHour, newOnMinute;
          if (sscanf(onTimeStr, "%d:%d", &newOnHour, &newOnMinute) != 2) {
            Serial.println("[Schedule Sync] ✗ Invalid on_time format");
            return;
          }
          
          // Parse off_time
          int newOffHour, newOffMinute;
          if (sscanf(offTimeStr, "%d:%d", &newOffHour, &newOffMinute) != 2) {
            Serial.println("[Schedule Sync] ✗ Invalid off_time format");
            return;
          }
          
          // Update schedule
          scheduleOnHour = newOnHour;
          scheduleOnMinute = newOnMinute;
          scheduleOffHour = newOffHour;
          scheduleOffMinute = newOffMinute;
          scheduleEnabled = enabled;
          
          // Save to NVS
          saveSchedule();
          
          Serial.print("[Schedule Sync] ✓ Schedule synced: ON ");
          Serial.print(newOnHour);
          Serial.print(":");
          Serial.print(newOnMinute);
          Serial.print(", OFF ");
          Serial.print(newOffHour);
          Serial.print(":");
          Serial.print(newOffMinute);
          Serial.print(" (enabled=");
          Serial.print(enabled ? "true" : "false");
          Serial.println(")");
          
          // Apply schedule immediately after sync
          runSchedule();
        } else {
          Serial.println("[Schedule Sync] ✗ Response missing schedule fields");
        }
      } else {
        Serial.print("[Schedule Sync] ✗ JSON parse error or 404: ");
        Serial.println(error.c_str());
      }
    } else {
      Serial.println("[Schedule Sync] ✗ No JSON found in response");
    }
  } else {
    Serial.println("[Schedule Sync] ✗ Empty response from server");
  }
  
  Serial.println();
}
