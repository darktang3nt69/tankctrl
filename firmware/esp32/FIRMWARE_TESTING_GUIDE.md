# TankCtl ESP32 Firmware v2.0.0 Testing Guide
## Phase 4: Multi-Relay Support

**Last Updated**: May 25, 2026  
**Firmware Version**: v2.0.0-esp32-multi-relay  
**Branch**: `feature/pump-control-gpio-config`

---

## Prerequisites

### Hardware
- ESP32 development board (e.g., ESP32-DevKitC)
- 2x 5V relays (or relay modules)
- Jumper wires
- USB cable for programming
- MQTT broker running (Mosquitto on 192.168.1.100:1883)
- Backend API running (registration on 192.168.1.100:8000)

### Software
- Arduino IDE (or PlatformIO)
- Libraries:
  - WiFi.h (built-in)
  - PubSubClient (MQTT)
  - ArduinoJson (v6.x)
  - OneWire (for temperature sensor, optional)
  - DallasTemperature (for DS18B20, optional)
  - Preferences (NVS storage, built-in)

### Wiring (Default Config)
```
Relay 1 (Light):
  GPIO 4 (D4) → Relay IN → Controls light

Relay 2 (Pump):
  GPIO 12 (D12) → Relay IN → Controls pump

Status LED:
  GPIO 2 (LED on most ESP32 boards)

Temperature Sensor (Optional):
  GPIO 23 (OneWire)
```

---

## Test Cases

### 1. Compilation Test
**Objective**: Firmware compiles without errors

**Steps**:
1. Open `firmware/esp32/tankctl_esp32.ino` in Arduino IDE
2. Select Board: "ESP32 Dev Module"
3. Click Verify (✓)

**Expected Result**:
```
Compiling sketch...
Sketch uses 450KB of program storage space.
Global variables use 35KB of dynamic memory.
✓ Compilation successful
```

**Memory Footprint**:
- Program: ~450 KB (flash)
- Static RAM: ~35 KB
- Heap (runtime): ~100-150 KB

---

### 2. Boot with Default Config
**Objective**: Device boots and loads default relay config from flash

**Setup**:
1. Flash firmware to ESP32
2. Reset device
3. Monitor serial output (9600 baud)

**Expected Output**:
```
=== TankCtl ESP32 Device Starting ===

[Relay] No relay config in NVS, using defaults
[Relay] Using default config: light (GPIO 4), pump (GPIO 12)
[Relay] GPIO initialized: light on pin 4 (active-LOW)
[Relay] GPIO initialized: pump on pin 12 (active-LOW)
[Boot] Pump set to ON (fail-safe)
[Relay] Reported state: {"light":"off","pump":"on"}
Loaded config from NVS. Tank ID: POND-ESP32
Connecting to WiFi: EMPIRE
WiFi connected. IP: 192.168.1.XXX
Connecting to MQTT broker: 192.168.1.100:1883
MQTT connected
Subscribed to: tankctl/POND-ESP32/command
Subscribed to: tankctl/POND-ESP32/config
Heartbeat sent
TankCtl ESP32 Device Ready
```

**Verify**:
- [ ] Serial output shows "Pump set to ON"
- [ ] MQTT subscriptions successful
- [ ] Device appears online in MQTT broker

---

### 3. Light State Control via Command
**Objective**: Set light relay via MQTT command

**Setup**:
1. Device is booted and connected to MQTT
2. Open MQTT client (e.g., `mosquitto_pub`)

**Test 3a**: Turn Light ON
```bash
mosquitto_pub -h 192.168.1.100 -t tankctl/POND-ESP32/command -m '{"command":"set_light","value":"on","version":1}'
```

**Expected Result**:
- Serial: `[Relay] Set light (GPIO 4) to on`
- GPIO 4 pulls LOW (relay activates)
- Published: `tankctl/POND-ESP32/reported` = `{"light":"on","pump":"on"}`

**Test 3b**: Turn Light OFF
```bash
mosquitto_pub -h 192.168.1.100 -t tankctl/POND-ESP32/command -m '{"command":"set_light","value":"off","version":2}'
```

**Expected Result**:
- Serial: `[Relay] Set light (GPIO 4) to off`
- GPIO 4 pulls HIGH (relay deactivates)
- Published: `tankctl/POND-ESP32/reported` = `{"light":"off","pump":"on"}`

**Verify**:
- [ ] Light relay clicks on/off
- [ ] Reported state updates
- [ ] Version prevents duplicate execution

---

### 4. Pump State Control via Command
**Objective**: Set pump relay via MQTT command

**Test 4a**: Turn Pump OFF
```bash
mosquitto_pub -h 192.168.1.100 -t tankctl/POND-ESP32/command -m '{"command":"set_pump","value":"off","version":3}'
```

**Expected Result**:
- Serial: `[Relay] Set pump (GPIO 12) to off`
- GPIO 12 pulls HIGH (relay deactivates)
- Published: `{"light":"off","pump":"off"}`

**Test 4b**: Turn Pump ON
```bash
mosquitto_pub -h 192.168.1.100 -t tankctl/POND-ESP32/command -m '{"command":"set_pump","value":"on","version":4}'
```

**Expected Result**:
- Serial: `[Relay] Set pump (GPIO 12) to on`
- GPIO 12 pulls LOW (relay activates)
- Published: `{"light":"off","pump":"on"}`

**Verify**:
- [ ] Pump relay clicks on/off
- [ ] Reported state includes both light and pump

---

### 5. Generic Relay Control
**Objective**: Control relays using generic `set_relay` command

**Test 5a**: Set Light via Generic Command
```bash
mosquitto_pub -h 192.168.1.100 -t tankctl/POND-ESP32/command -m '{"command":"set_relay","relay_name":"light","value":"on","version":5}'
```

**Expected Result**:
- Serial: `[Relay] Set light (GPIO 4) to on`
- GPIO 4 activates
- Published: `{"light":"on","pump":"on"}`

**Test 5b**: Set Pump via Generic Command
```bash
mosquitto_pub -h 192.168.1.100 -t tankctl/POND-ESP32/command -m '{"command":"set_relay","relay_name":"pump","value":"off","version":6}'
```

**Expected Result**:
- Serial: `[Relay] Set pump (GPIO 12) to off`
- Published: `{"light":"on","pump":"off"}`

**Verify**:
- [ ] Generic command works for both relays
- [ ] Relay name lookup succeeds

---

### 6. Configuration Reception via MQTT
**Objective**: Device receives new config, persists to NVS, applies GPIO

**Setup**:
1. Device running with default config
2. Prepare new config with different GPIOs

**Test 6a**: Replace Pump GPIO
```bash
mosquitto_pub -h 192.168.1.100 -t tankctl/POND-ESP32/config -m '{"relays":[{"relay_name":"light","gpio_pin":4,"active_level":"LOW"},{"relay_name":"pump","gpio_pin":14,"active_level":"LOW"}]}'
```

**Expected Result**:
- Serial:
  ```
  [Config] Received config message
  [Config] Validated: light on GPIO 4
  [Config] Validated: pump on GPIO 14
  [Config] Applied 2 relays
  [Relay] GPIO initialized: light on pin 4 (active-LOW)
  [Relay] GPIO initialized: pump on pin 14 (active-LOW)
  [Relay] Config saved to NVS: [{"relay_name":"light","gpio_pin":4,"active_level":"LOW"},{"relay_name":"pump","gpio_pin":14,"active_level":"LOW"}]
  [Relay] Reported state: {"light":"off","pump":"off"}
  ```
- GPIO 12 returns to HIGH (no longer controlled)
- GPIO 14 now controls pump

**Verify**:
- [ ] Device logs "Applied 2 relays"
- [ ] Old GPIO (12) released
- [ ] New GPIO (14) initialized
- [ ] Config saved to NVS

---

### 7. NVS Persistence
**Objective**: Relay config persists across reboots

**Setup**:
1. Device with custom config from Test 6a (pump on GPIO 14)

**Test 7a**: Reboot and Verify
```
Serial Monitor - Power cycle or reset device
```

**Expected Output**:
```
=== TankCtl ESP32 Device Starting ===

[Relay] Loading config from NVS...
[Relay] Loaded: light on GPIO 4 (LOW)
[Relay] Loaded: pump on GPIO 14 (LOW)
[Relay] Total relays loaded: 2
[Relay] GPIO initialized: light on pin 4 (active-LOW)
[Relay] GPIO initialized: pump on pin 14 (active-LOW)
[Boot] Pump set to ON (fail-safe)
```

**Verify**:
- [ ] Config loaded from NVS on boot
- [ ] Pump on GPIO 14 (new config), not GPIO 12
- [ ] Pump ON at boot

---

### 8. Active-HIGH Relay Support
**Objective**: Device supports active-HIGH relays

**Setup**:
1. Device running

**Test 8a**: Configure with Active-HIGH
```bash
mosquitto_pub -h 192.168.1.100 -t tankctl/POND-ESP32/config -m '{"relays":[{"relay_name":"light","gpio_pin":4,"active_level":"HIGH"}]}'
```

**Expected Result**:
- Serial:
  ```
  [Config] Validated: light on GPIO 4
  [Relay] GPIO initialized: light on pin 4 (active-HIGH)
  ```
- GPIO 4 logic inverted (HIGH = on, LOW = off)

**Test 8b**: Control Active-HIGH Light
```bash
mosquitto_pub -h 192.168.1.100 -t tankctl/POND-ESP32/command -m '{"command":"set_light","value":"on","version":10}'
```

**Expected Result**:
- Serial: `[Relay] Set light (GPIO 4) to on`
- GPIO 4 pulls HIGH (opposite of active-LOW)
- Relay activates with inverted logic

**Verify**:
- [ ] GPIO logic inverted correctly
- [ ] Relay control still works

---

### 9. Error Handling: Invalid GPIO
**Objective**: Device rejects invalid GPIO pins (>39)

**Setup**:
1. Device running

**Test 9a**: Send Config with Invalid GPIO
```bash
mosquitto_pub -h 192.168.1.100 -t tankctl/POND-ESP32/config -m '{"relays":[{"relay_name":"light","gpio_pin":50,"active_level":"LOW"}]}'
```

**Expected Result**:
- Serial:
  ```
  [Config] ERROR: Invalid GPIO pin 50 (must be 0-39)
  [Config] ERROR: No valid relays in config
  ```
- Device keeps previous config (no change)

**Verify**:
- [ ] Invalid GPIO rejected
- [ ] Previous config unchanged
- [ ] Error logged

---

### 10. Error Handling: Duplicate GPIO
**Objective**: Device rejects duplicate GPIO assignments

**Setup**:
1. Device running

**Test 10a**: Send Config with Duplicate GPIO
```bash
mosquitto_pub -h 192.168.1.100 -t tankctl/POND-ESP32/config -m '{"relays":[{"relay_name":"light","gpio_pin":4,"active_level":"LOW"},{"relay_name":"pump","gpio_pin":4,"active_level":"LOW"}]}'
```

**Expected Result**:
- Serial:
  ```
  [Config] Validated: light on GPIO 4
  [Config] ERROR: Duplicate GPIO pin 4
  [Config] Applied 1 relays
  ```
- Only light relay configured, pump skipped

**Verify**:
- [ ] Duplicate GPIO detected
- [ ] Only valid relays applied

---

### 11. Error Handling: Duplicate Relay Name
**Objective**: Device rejects duplicate relay names

**Setup**:
1. Device running

**Test 11a**: Send Config with Duplicate Name
```bash
mosquitto_pub -h 192.168.1.100 -t tankctl/POND-ESP32/config -m '{"relays":[{"relay_name":"light","gpio_pin":4,"active_level":"LOW"},{"relay_name":"light","gpio_pin":14,"active_level":"LOW"}]}'
```

**Expected Result**:
- Serial:
  ```
  [Config] Validated: light on GPIO 4
  [Config] ERROR: Duplicate relay name light
  [Config] Applied 1 relays
  ```

**Verify**:
- [ ] Duplicate name rejected
- [ ] First valid relay kept

---

### 12. Error Handling: Invalid JSON
**Objective**: Device gracefully handles malformed JSON

**Setup**:
1. Device running with valid config

**Test 12a**: Send Malformed JSON
```bash
mosquitto_pub -h 192.168.1.100 -t tankctl/POND-ESP32/config -m '{"relays": invalid json}'
```

**Expected Result**:
- Serial:
  ```
  [Config] JSON parse failed: ...
  ```
- Device keeps previous config

**Verify**:
- [ ] Parse error logged
- [ ] Config unchanged

---

### 13. Oversized Payload
**Objective**: Device rejects payloads exceeding buffer size

**Setup**:
1. Device running

**Test 13a**: Send Oversized JSON (>512 bytes)
```bash
# Generate large payload
python3 -c "import json; config = {'relays': [{'relay_name': f'relay{i}', 'gpio_pin': i, 'active_level': 'LOW'} for i in range(50)]}; print(json.dumps(config))"
```

**Expected Result**:
- Serial:
  ```
  [Config] ERROR: Payload too large (XXX >= 512)
  ```
- Device keeps previous config

**Verify**:
- [ ] Oversized payload rejected
- [ ] Buffer overflow prevented

---

### 14. Version Validation
**Objective**: Device ignores old commands (version <= lastCommandVersion)

**Setup**:
1. Device running

**Test 14a**: Send Command with Old Version
```bash
# Send version 10
mosquitto_pub -h 192.168.1.100 -t tankctl/POND-ESP32/command -m '{"command":"set_light","value":"on","version":10}'
# Send version 5 (older)
mosquitto_pub -h 192.168.1.100 -t tankctl/POND-ESP32/command -m '{"command":"set_light","value":"off","version":5}'
```

**Expected Result**:
- First command: Light ON
- Second command:
  ```
  Serial: Ignoring old command version: 5
  ```
- Light stays ON (not turned off)

**Verify**:
- [ ] Old version ignored
- [ ] State not changed
- [ ] Idempotency maintained

---

### 15. Heartbeat and Telemetry
**Objective**: Device publishes heartbeat and telemetry

**Setup**:
1. Device running
2. Subscribe to telemetry topic

**Test 15a**: Monitor Heartbeat
```bash
mosquitto_sub -h 192.168.1.100 -t tankctl/POND-ESP32/heartbeat
```

**Expected Output** (every 30s):
```json
{"status":"online","uptime_ms":123456,"rssi":-45,"firmware_version":"2.0.0-esp32-multi-relay","chip":"ESP32","free_heap":250000}
```

**Verify**:
- [ ] Heartbeat published every 30 seconds
- [ ] free_heap > 100000 (healthy)
- [ ] firmware_version is v2.0.0

---

### 16. Schedule Control (Light Relay)
**Objective**: Schedule still works for light relay

**Setup**:
1. Device running
2. Set schedule via API or MQTT command

**Test 16a**: Set Schedule
```bash
mosquitto_pub -h 192.168.1.100 -t tankctl/POND-ESP32/command -m '{"command":"set_schedule","on_time":"18:00","off_time":"06:00","version":20}'
```

**Expected Result**:
- Serial: `Schedule updated: ON 18:00, OFF 06:00`
- Schedule applied to light relay
- Light ON during window, OFF outside

**Verify**:
- [ ] Schedule accepted
- [ ] Light toggles on schedule
- [ ] Pump unaffected

---

### 17. Device Registration
**Objective**: Device registers and receives relay config on first boot

**Setup**:
1. Fresh firmware flash (NVS cleared)
2. Backend running with relay config endpoint

**Expected Result**:
- Device registers with backend
- Backend auto-creates default relays (light, pump)
- Relays appear in `GET /devices/POND-ESP32/relays`

---

## Regression Tests

### R1: Light Schedule Still Works
- Boot device → Set schedule via command → Light toggles on time

### R2: Backward Compatibility
- Old `set_light` command works (not just generic `set_relay`)
- Old `set_pump` command works

### R3: MQTT Reconnection
- Disconnect WiFi → Device reconnects → Re-subscribes to topics → Commands work

### R4: Heap Health
- Monitor `free_heap` in heartbeat for 1 hour → Should stay > 100 KB
- No gradual decline (no memory leaks)

---

## Performance Checklist

- [ ] Relay command latency: < 100ms (GPIO write is instant)
- [ ] Config apply time: < 500ms (GPIO re-init)
- [ ] MQTT publish latency: < 200ms
- [ ] Memory stable after 1 hour (no leaks)
- [ ] No watchdog resets
- [ ] All relays respond to commands

---

## Debugging Tips

### Serial Monitor
- Set baud rate to 9600
- Look for `[Relay]`, `[Config]`, `[Schedule]` prefixes
- Check heap in heartbeat: `free_heap` should be > 100KB

### MQTT Debugging
```bash
# Monitor all topics
mosquitto_sub -h 192.168.1.100 -t "tankctl/+/+" -v

# Monitor just one device
mosquitto_sub -h 192.168.1.100 -t "tankctl/POND-ESP32/#" -v
```

### NVS Inspection (via Arduino IDE)
- Use IDE's Tools → Partition Scheme to view NVS
- Or access via serial: Send config, reboot, verify it loads

---

## Known Limitations

- Max 10 relays per device (static array)
- Max config payload: 512 bytes
- No active_level validation (only "LOW" or "HIGH" accepted, no case check)
- No relay state feedback from GPIO (software state only)
- No relay current measurement

---

## Testing Sign-Off

| Test Case | Status | Date | Notes |
|-----------|--------|------|-------|
| 1. Compilation | [ ] | | |
| 2. Boot Default | [ ] | | |
| 3. Light Command | [ ] | | |
| 4. Pump Command | [ ] | | |
| 5. Generic Command | [ ] | | |
| 6. Config Reception | [ ] | | |
| 7. NVS Persistence | [ ] | | |
| 8. Active-HIGH | [ ] | | |
| 9. Invalid GPIO | [ ] | | |
| 10. Duplicate GPIO | [ ] | | |
| 11. Duplicate Name | [ ] | | |
| 12. Invalid JSON | [ ] | | |
| 13. Oversized Payload | [ ] | | |
| 14. Version Validation | [ ] | | |
| 15. Heartbeat | [ ] | | |
| 16. Schedule Control | [ ] | | |
| 17. Device Registration | [ ] | | |
| **All Pass** | [ ] | | Ready for Production |

---

## Next Steps

1. **Unit Testing**: Verify all test cases above
2. **Integration Testing**: Test with backend API for full flow
3. **Load Testing**: Multiple devices on same MQTT broker
4. **Long-term Stability**: Run 24h+ for memory leaks
5. **Documentation**: Update DEVICES.md with new firmware features

