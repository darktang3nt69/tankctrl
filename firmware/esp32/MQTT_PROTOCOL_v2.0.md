# TankCtl Multi-Relay MQTT Protocol v2.0

**Firmware Version**: v2.0.0-esp32-multi-relay  
**Effective**: May 25, 2026  
**Backward Compatible**: Yes (legacy commands still work)

**Authentication**: The broker no longer accepts anonymous connections.
The device connects with a per-device username (`device_id`) and password
issued at registration time, baked into `firmware/esp32/secrets.h` (not
committed - copy the placeholder and fill in real values per device at
flash time).

---

## Topics

### Subscription (Device Receives)

#### 1. Command Topic: `tankctl/{device_id}/command`

**Purpose**: Send relay control commands to device

**Supported Commands**:

##### a) Legacy Light Command (Backward Compatible)
```json
{
  "command": "set_light",
  "value": "on|off",
  "version": <int>
}
```

**Example**:
```bash
mosquitto_pub -h 192.168.1.100 -t tankctl/POND-ESP32/command -m '{"command":"set_light","value":"on","version":1}'
```

**Result**: Sets "light" relay to specified state

---

##### b) Legacy Pump Command (Backward Compatible)
```json
{
  "command": "set_pump",
  "value": "on|off",
  "version": <int>
}
```

**Example**:
```bash
mosquitto_pub -h 192.168.1.100 -t tankctl/POND-ESP32/command -m '{"command":"set_pump","value":"off","version":2}'
```

**Result**: Sets "pump" relay to specified state

---

##### c) Generic Relay Command (NEW)
```json
{
  "command": "set_relay",
  "relay_name": "<relay_name>",
  "value": "on|off",
  "version": <int>
}
```

**Example**:
```bash
mosquitto_pub -h 192.168.1.100 -t tankctl/POND-ESP32/command -m '{"command":"set_relay","relay_name":"heater","value":"on","version":3}'
```

**Result**: Sets relay with name "heater" to ON

**Valid relay_name values**:
- "light" (default GPIO 4)
- "pump" (default GPIO 12)
- Any relay in device config

---

##### d) Schedule Command (Existing)
```json
{
  "command": "set_schedule",
  "on_time": "HH:MM",
  "off_time": "HH:MM",
  "version": <int>
}
```

**Example**:
```bash
mosquitto_pub -h 192.168.1.100 -t tankctl/POND-ESP32/command -m '{"command":"set_schedule","on_time":"18:00","off_time":"06:00","version":4}'
```

**Result**: Sets light schedule (applies to "light" relay only)

---

##### e) Reboot Command (Existing)
```json
{
  "command": "reboot_device",
  "version": <int>
}
```

**Example**:
```bash
mosquitto_pub -h 192.168.1.100 -t tankctl/POND-ESP32/command -m '{"command":"reboot_device","version":5}'
```

**Result**: Publishes final state and reboots device

---

#### 2. Config Topic: `tankctl/{device_id}/config` (NEW)

**Purpose**: Push relay configuration to device

**Format**:
```json
{
  "relays": [
    {
      "relay_name": "<string>",
      "gpio_pin": <0-39>,
      "active_level": "LOW|HIGH",
      "fail_safe_default": "on|off",
      "cutoff_ceiling_seconds": <int or null>
    },
    ...
  ]
}
```

**Fail-safe relay contract** (`fail_safe_default`, `cutoff_ceiling_seconds`):
- `fail_safe_default`: GPIO state the device forces this relay to at boot
  and whenever it enters `time_unknown` (see status section below).
  Optional in the payload for backward compatibility - if omitted, the
  device falls back to `"on"` for a relay named `pump` and `"off"` for
  everything else.
- `cutoff_ceiling_seconds`: hard continuous-on ceiling enforced by an
  independent on-device watchdog, regardless of scheduler/command state.
  `null`/omitted means no ceiling (relay fails open, e.g. filter/pump).
- Both fields are cached to NVS alongside `gpio_pin`/`active_level`, so
  they survive reboot without a live MQTT connection.

**Example**: Configure light (GPIO 4) and pump (GPIO 12)
```bash
mosquitto_pub -h 192.168.1.100 -t tankctl/POND-ESP32/config -m '{
  "relays": [
    {"relay_name": "light", "gpio_pin": 4, "active_level": "LOW"},
    {"relay_name": "pump", "gpio_pin": 12, "active_level": "LOW"}
  ]
}'
```

**Example**: Add heater on GPIO 14
```bash
mosquitto_pub -h 192.168.1.100 -t tankctl/POND-ESP32/config -m '{
  "relays": [
    {"relay_name": "light", "gpio_pin": 4, "active_level": "LOW"},
    {"relay_name": "pump", "gpio_pin": 12, "active_level": "LOW"},
    {"relay_name": "heater", "gpio_pin": 14, "active_level": "LOW"}
  ]
}'
```

**Validation Rules**:
- GPIO pins must be 0-39 (ESP32 valid range)
- No duplicate GPIO pins (conflict detected)
- No duplicate relay names
- active_level must be "LOW" or "HIGH"
- Max 10 relays per device
- Max config payload: 1024 bytes (bumped from 512 to fit fail_safe_default/cutoff_ceiling_seconds per relay)

**Error Handling**:
- Invalid GPIO: rejected, previous config kept
- Duplicate GPIO: rejected, previous config kept
- Duplicate name: rejected, previous config kept
- Invalid JSON: parse error, previous config kept
- Oversized payload: dropped, previous config kept

**Persistence**:
- Config saved to NVS Preferences
- Loaded on device boot
- Survives power cycles

---

### Publication (Device Sends)

#### 1. Reported State: `tankctl/{device_id}/reported`

**Purpose**: Device publishes current relay states

**Format**:
```json
{
  "<relay_name>": "on|off",
  "<relay_name>": "on|off",
  ...
}
```

**Example** (default config):
```json
{
  "light": "off",
  "pump": "on"
}
```

**Example** (with heater):
```json
{
  "light": "on",
  "pump": "off",
  "heater": "on"
}
```

**Published When**:
- On MQTT connect (initial state)
- After any relay command
- After config update
- On schedule change

**Subscribe**:
```bash
mosquitto_sub -h 192.168.1.100 -t tankctl/POND-ESP32/reported
```

---

#### 2. Heartbeat: `tankctl/{device_id}/heartbeat`

**Purpose**: Device health status (existing)

**Format**:
```json
{
  "status": "online",
  "uptime_ms": <milliseconds>,
  "rssi": <signal_strength>,
  "firmware_version": "<version>",
  "chip": "ESP32",
  "free_heap": <bytes>
}
```

`status` is `"online"` normally, or `"time_unknown"` when the device does
not trust its own clock (DS3231 `lostPower()` at boot, or the cached
schedule failed its checksum) - the on-device light schedule is withheld
and every fail-safe-contracted relay is held at its `fail_safe_default`
while in this state. It resumes `"online"` once a real time fix lands (NTP
sync, or a fresh schedule push).

**Example**:
```json
{
  "status": "online",
  "uptime_ms": 3600000,
  "rssi": -45,
  "firmware_version": "2.0.0-esp32-multi-relay",
  "chip": "ESP32",
  "free_heap": 250000
}
```

**Published Every**: 30 seconds

---

#### 3. Telemetry: `tankctl/{device_id}/telemetry`

**Purpose**: Sensor data (existing)

**Format**:
```json
{
  "temperature": <float>
}
```

**Example**:
```json
{
  "temperature": 24.5
}
```

**Published Every**: 10 seconds

---

#### 4. Status: `tankctl/{device_id}/status`

**Purpose**: Error and warning messages

**Format** (on error):
```json
{
  "event": "warning|error",
  "code": "<error_code>",
  "message": "<human_readable>"
}
```

**Examples**:
```json
{"event": "warning", "code": "sensor_unavailable", "message": "Temperature sensor not connected"}
```

---

## Backend Integration

### API Endpoint: Push Config to Device

**Endpoint**: `POST /devices/{device_id}/relays/push-config`

**Backend Action**:
1. Fetch device relays from database
2. Serialize to JSON array
3. Publish to `tankctl/{device_id}/config`
4. Device receives and validates
5. Device publishes state to `reported` topic
6. Backend can subscribe to verify

**Example Flow**:
```
POST /devices/POND-ESP32/relays/push-config
→ Backend queries DB for relays
→ Backend publishes config to MQTT
→ Device receives, validates, applies
→ Device publishes reported state
→ Cycle complete
```

---

## Default Relay Configuration

### On First Boot (NVS Empty)

```json
{
  "relays": [
    {"relay_name": "light", "gpio_pin": 4, "active_level": "LOW"},
    {"relay_name": "pump", "gpio_pin": 12, "active_level": "LOW"}
  ]
}
```

### Boot Behavior

- **Light**: OFF (safe default)
- **Pump**: ON (fail-safe: prevents water overflow in float mode)

---

## Version Control

### Command Versioning (Idempotency)

- Each command has a `"version"` field (integer)
- Device tracks `lastCommandVersion`
- Device ignores commands with `version <= lastCommandVersion`
- Prevents duplicate execution from MQTT retransmission

**Example**:
```
1. Publish: version=1, set_light=on
   → Device executes, sets lastCommandVersion=1

2. Publish: version=1, set_light=off (retry from broker)
   → Device ignores (1 <= 1)

3. Publish: version=2, set_light=off
   → Device executes, sets lastCommandVersion=2
```

---

## Active-Level Logic

### Active-LOW (Most Common)

```
GPIO HIGH  → Relay OFF (no current)
GPIO LOW   → Relay ON  (current flows)
```

**Example**:
```json
{"relay_name": "light", "gpio_pin": 4, "active_level": "LOW"}
```

When `"on"`: GPIO 4 → LOW  (relay activates)  
When `"off"`: GPIO 4 → HIGH (relay deactivates)

### Active-HIGH

```
GPIO LOW   → Relay OFF
GPIO HIGH  → Relay ON
```

**Example**:
```json
{"relay_name": "light", "gpio_pin": 4, "active_level": "HIGH"}
```

When `"on"`: GPIO 4 → HIGH (relay activates)  
When `"off"`: GPIO 4 → LOW  (relay deactivates)

---

## Error Scenarios

### Invalid GPIO Pin

**Request**:
```bash
mosquitto_pub -h 192.168.1.100 -t tankctl/POND-ESP32/config -m '{
  "relays": [{"relay_name": "light", "gpio_pin": 50, "active_level": "LOW"}]
}'
```

**Device Response**:
- Serial: `[Config] ERROR: Invalid GPIO pin 50 (must be 0-39)`
- Config: NOT updated
- State: Unchanged

---

### Duplicate GPIO

**Request**:
```bash
mosquitto_pub -h 192.168.1.100 -t tankctl/POND-ESP32/config -m '{
  "relays": [
    {"relay_name": "light", "gpio_pin": 4, "active_level": "LOW"},
    {"relay_name": "pump", "gpio_pin": 4, "active_level": "LOW"}
  ]
}'
```

**Device Response**:
- Serial: `[Config] Applied 1 relays` (only light, pump skipped)
- Pump relay NOT updated

---

### Relay Not Found

**Request**:
```bash
mosquitto_pub -h 192.168.1.100 -t tankctl/POND-ESP32/command -m '{"command":"set_relay","relay_name":"nonexistent","value":"on","version":1}'
```

**Device Response**:
- Serial: `[Relay] set_relay: relay 'nonexistent' not found`
- Command: NOT executed
- State: Unchanged

---

## Migration Guide (v1.0 → v2.0)

### Breaking Changes
- None! Full backward compatibility maintained

### New Capabilities
1. **Multi-relay support**: Add heater, valve, etc.
2. **Generic command**: Use `set_relay` for any relay
3. **Config persistence**: Survives reboots
4. **Active-level**: Support active-HIGH relays

### Migration Steps
1. Upgrade firmware to v2.0.0
2. Device boots with default config (light, pump)
3. Optionally push new config via `/relays/push-config` API
4. Existing `set_light`, `set_pump` commands still work
5. New relays can be added via config

---

## Monitoring & Debugging

### Subscribe to All Device Topics
```bash
mosquitto_sub -h 192.168.1.100 -t "tankctl/POND-ESP32/#" -v
```

**Output**:
```
tankctl/POND-ESP32/command {"command":"set_light","value":"on","version":1}
tankctl/POND-ESP32/reported {"light":"on","pump":"off"}
tankctl/POND-ESP32/telemetry {"temperature":24.5}
tankctl/POND-ESP32/heartbeat {"status":"online",...}
```

### Monitor Errors
```bash
mosquitto_sub -h 192.168.1.100 -t "tankctl/+/status"
```

---

## FAQ

**Q: Can I rename a relay?**  
A: No, relay names are immutable. Delete and re-create with new name.

**Q: How many relays can I add?**  
A: Max 10 per device (static array limit for memory efficiency).

**Q: What happens if I send config while a command is being executed?**  
A: Config is accepted and applied immediately. Commands in flight may fail if relay no longer exists.

**Q: Can I mix active-LOW and active-HIGH relays?**  
A: Yes, each relay has independent active_level logic.

**Q: What's the maximum payload size?**  
A: 512 bytes for config JSON. 10 relays with ~30 bytes each = ~300 bytes.

**Q: Does the device auto-recover from MQTT disconnect?**  
A: Yes, device reconnects every 3 seconds and re-subscribes to all topics.

