# MQTT Last Will and Testament (LWT) Implementation

## Overview

TankCtl now supports MQTT Last Will and Testament (LWT) for **fast offline detection** of Arduino devices. When a device disconnects ungracefully (power loss, network failure), the MQTT broker automatically publishes an offline status message to the backend.

## Architecture

### Timeline of Events

```
Device connects normally:
├─ Device sets LWT: "status": "offline" (QoS 1, retained)
├─ Device publishes "status": "online" (retained) → replaces LWT
├─ Backend receives online status
└─ Device appears online in UI

Device power loss (ungraceful disconnect):
├─ MQTT broker detects disconnect after KeepAlive timeout (60s default)
├─ Broker publishes LWT: "status": "offline" → tankctl/{device_id}/status
├─ Backend DeviceStatusHandler receives offline message
├─ Device marked offline immediately (~60s vs 30-60s with heartbeat)
└─ Device appears offline in UI
```

### Message Formats

**LWT Message (published by broker on ungraceful disconnect):**
```json
{
  "status": "offline",
  "timestamp": 1679702400,
  "reason": "ungraceful_disconnect"
}
```

**Online Status Message (published by device on connect):**
```json
{
  "status": "online",
  "timestamp": 1679702400,
  "firmware_version": "1.0.0"
}
```

**Warning/Sensor Message (device published):**
```json
{
  "status": "warning",
  "code": "sensor_unavailable",
  "message": "Temperature sensor not connected or reading invalid"
}
```

## Implementation Details

### Arduino Changes (`firmware/tankctl_device/tankctl_device.ino`)

1. **LWT Configuration** in `connectMQTT()`:
   - Call `mqttClient.setWill()` before `mqttClient.connect()`
   - Topic: `tankctl/{device_id}/status`
   - Payload: JSON with `status: "offline"`
   - QoS 1 (at least once delivery)
   - Retain flag: true (persists on broker)

2. **Online Status Publishing**:
   - After successful connection, device publishes `status: "online"`
   - Message is retained, replacing the LWT message
   - Includes firmware version for diagnostics

```cpp
// Set LWT before connecting
mqttClient.setWill(topicStatus, lwtPayload, strlen(lwtPayload), 1, true);

if (mqttClient.connect(clientId)) {
  // Publish online status to clear LWT
  mqttClient.publish(topicStatus, onlinePayload, true);  // retain=true
}
```

### Backend Changes (`src/infrastructure/mqtt/handlers.py`)

**Enhanced DeviceStatusHandler:**
- Listens to `tankctl/+/status` messages
- Handles three message types:
  1. `status: "offline"` → Mark device offline, publish event, trigger UI update
  2. `status: "online"` → Mark device online via heartbeat, publish event
  3. `status: "warning"` → Log warning, publish event

```python
class DeviceStatusHandler(MessageHandler):
    def handle(self, device_id: str, payload: dict) -> None:
        status = payload.get("status", "unknown")
        
        if status == "offline":
            # Mark device offline immediately (LWT triggered)
            device.mark_offline()
            device_repo.update(device)
            
        elif status == "online":
            # Mark device online (device published status)
            device_service.handle_heartbeat(device_id, ...)
```

## Benefits

| Benefit | Before LWT | With LWT |
|---------|-----------|---------|
| **Offline Detection** | 30-60s (heartbeat timeout) | ~60s (MQTT KeepAlive) |
| **Ungraceful Disconnect** | Detected by scheduler | Immediate via LWT |
| **Power Loss Detection** | Missed until heartbeat timeout | Broker publishes LWT |
| **Network Failure** | Timeout-based | Immediate detection |
| **Retained State** | No | Yes (status persists) |
| **Zero Device Logic** | Already working | Already working |

## Testing Checklist

- [ ] Arduino device builds and flashes successfully
- [ ] Device connects to MQTT and publishes online status
- [ ] Backend receives online message and marks device online
- [ ] Unplug device (power loss)
- [ ] Verify backend marks device offline within 60s
- [ ] Backend publishes `device_offline` event
- [ ] UI shows device offline status
- [ ] Reconnect device
- [ ] Verify device comes back online

## Fallback Behavior

**If LWT fails or doesn't work:**
- Scheduler health check still runs every 30s
- Devices timeout after 60s without heartbeat
- Device marked offline by scheduler (existing mechanism)
- System remains reliable, just slower

## MQTT Topics

All status messages use:
- **Topic:** `tankctl/{device_id}/status`
- **Retained:** true (message persists on broker)
- **QoS:** 1 (at least once delivery)
- **Format:** JSON object with required `status` field

## Configuration

No configuration needed. LWT is:
- Automatically set on Arduino connect
- Automatically handled by backend via DeviceStatusHandler
- Already subscribed via `SUBSCRIBE_STATUS = "tankctl/+/status"`

## Monitoring

**Log messages to watch for:**
- `device_offline_detected_ltw` - Device went offline via LWT
- `device_online_detected` - Device connected and published status
- `device_warning` - Device published warning (e.g., sensor unavailable)

**Events published:**
- `device_offline` with source: "ltw"
- `device_online` with source: "status_message"
- `device_warning` with code and message

## Compatibility

- **Arduino:** Uses PubSubClient library (already included)
- **Mosquitto:** Supports LWT (MQTT 3.1.1+)
- **Backend:** paho-mqtt client (already supports LWT handling)
- **Devices:** No changes needed to existing devices (graceful but faster shutdown)
