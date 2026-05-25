# Phase 5: Multi-Relay Command & Shadow Service - Implementation Complete

## Overview

Phase 5 successfully extends CommandService and ShadowService to handle multiple relays and pump control. The implementation maintains backward compatibility with existing light-only devices while enabling flexible multi-relay control.

---

## Phase 5A: CommandService Updates ✅

**File:** `src/services/command_service.py`

### Changes

1. **Relay Name Extraction** (`_extract_relay_name()`)
   - Parses command names to identify relay targets
   - Supports formats: `set_pump`, `set_light`, `set_relay_<name>`
   - Returns relay name or None for non-relay commands

2. **Relay Validation** (`_validate_relay_command()`)
   - Validates relay-based commands before sending
   - Checks: value is "on" or "off" (case-sensitive)
   - Verifies relay exists via RelayConfigService
   - Raises `ValueError` with descriptive error messages

3. **Enhanced send_command()**
   - Validates relay commands before creating command record
   - Extracts relay name for structured logging
   - Logs relay_name and value in command_sent events
   - Distinguishes ValueError (validation) from other exceptions

### Example Usage

```python
command_service = CommandService(session)

# Pump command - validates pump relay exists
cmd = command_service.send_command(
    device_id="tank1",
    command="set_pump",
    value="on"
)

# Generic relay command
cmd = command_service.send_command(
    device_id="tank1",
    command="set_relay_heater",
    value="off"
)
```

### Error Handling

- **ValueError**: Validation failed (invalid value, relay not found) → API returns 400
- **Exception**: MQTT publish or DB error → API returns 500

---

## Phase 5B: ShadowService Updates ✅

**File:** `src/services/shadow_service.py`

### Changes

1. **Enhanced reconcile_shadow()**
   - Logs version and delta keys for debugging
   - Sends one command per relay mismatch
   - Passes explicit version to commands (shadow.version + 1)
   - Continues on command send failure (fault tolerance)
   - Detailed error logging per relay

2. **Enhanced handle_reported_state()**
   - Tracks state changes for ALL relays (not just light)
   - Publishes relay_state_changed event generically
   - Maintains backward compatibility: light_state_changed still published
   - Publishes shadow_synchronized when all relays sync
   - Detailed logging of individual relay state changes

### Multi-Relay Reconciliation Algorithm

```python
shadow.desired = {"light": "on", "pump": "on"}
shadow.reported = {"light": "on", "pump": "off"}

# Delta = {"pump": "on"}
for relay_name, desired_value in delta.items():
    send_command(device_id, f"set_{relay_name}", desired_value)
```

### Event Flow

1. Device publishes reported state: `{"light": "on", "pump": "on"}`
2. ShadowService.handle_reported_state() is called
3. Compares old vs new: `"pump": "off" -> "on"`
4. Publishes events:
   - `light_state_changed` (for backward compatibility)
   - `relay_state_changed` (generic, all relays)
   - `shadow_synchronized` (if all relays match)

---

## Phase 5C: DeviceService Updates ✅

**File:** `src/services/device_service.py`

### Changes

1. **Multi-Relay Shadow Initialization**
   - After registering default relays, initializes shadow
   - Creates initial desired state from relay defaults
   - Sets all relays to their safe default_state (typically "off")
   - Updates shadow in DB with initial state and version

2. **Example Initial State**

```json
{
  "device_id": "tank1",
  "desired": {"light": "off", "pump": "off"},
  "reported": {},
  "version": 1
}
```

### Registration Flow

```python
1. Create device record
2. Create empty shadow
3. Create light schedule
4. Register default relays [light, pump]
5. Build initial_desired_state from relays
6. Update shadow with initial state
7. Publish device_registered event
```

---

## API Endpoint Updates ✅

**File:** `src/api/routes/commands.py`

### Improved Error Handling

Both `/devices/{device_id}/pump` and `/devices/{device_id}/light` endpoints now:

- Return **400 Bad Request** for validation errors (invalid value, relay not found)
- Return **404 Not Found** for non-existent devices
- Return **500 Internal Server Error** for infrastructure failures

Example:
```python
try:
    command = command_service.send_command(...)
except ValueError as e:
    raise HTTPException(status_code=400, detail=str(e))
except Exception as e:
    raise HTTPException(status_code=500, detail="Failed to set pump")
```

---

## Test Coverage ✅

**File:** `tests/test_phase5_multi_relay.py`

Comprehensive tests covering:

1. **CommandService**
   - Relay name extraction (pump, light, relay_*)
   - Validation success/failure (value, relay existence)
   - Multi-relay command sending

2. **ShadowService**
   - Multi-relay reconciliation (partial delta)
   - Multi-relay state change events
   - Backward compatibility (light_state_changed)

3. **DeviceService**
   - Multi-relay shadow initialization on registration
   - Default state mapping from relay configuration

---

## Backward Compatibility ✅

- **Light-only devices**: Still work unchanged
- **New multi-relay devices**: Support light + pump + custom relays
- **Events**: light_state_changed still published for light changes
- **Commands**: Light commands (set_light) work identically

### Example: Light-Only Device

```json
{
  "device_id": "old_device",
  "desired": {"light": "on"},
  "reported": {"light": "on"},
  "version": 1
}
```

### Example: Multi-Relay Device

```json
{
  "device_id": "new_device",
  "desired": {"light": "off", "pump": "on"},
  "reported": {},
  "version": 1
}
```

---

## Key Design Patterns

### 1. Lazy Relay Validation
- Relay config fetched only when needed (relay command)
- Non-relay commands skip validation entirely
- Reduces DB queries for reboot/other commands

### 2. Versioning Strategy
- CommandService auto-increments version per device
- ShadowService passes version to commands
- Device uses version for idempotency

### 3. Fault Tolerance
- ShadowService continues reconciliation on individual command failures
- Partial reconciliation still logged and traced
- Device eventually catches up in next reconciliation cycle

### 4. Structured Logging
- Device ID, relay name, version in every log entry
- Enables efficient debugging with grep/ELK stack
- Example: `device_id=tank1 relay_name=pump version=5 state=on`

---

## Architecture Diagram

```
API Endpoint (/devices/{id}/pump)
    ↓
set_pump() 
    ↓
ShadowService.set_desired_state({"pump": "on"})
    ↓ Updates desired state
CommandService.send_command("set_pump", "on")
    ├─ _validate_relay_command()
    │   └─ RelayConfigService.get_device_relay_config()
    ├─ Create command record
    └─ MQTT publish to tankctl/{device_id}/command
    
Device receives command → executes → publishes reported state

ShadowService.handle_reported_state()
    ├─ Compare old vs new state
    ├─ Publish relay_state_changed event
    ├─ Check if synchronized
    └─ Publish shadow_synchronized if needed
```

---

## Database State

### DeviceShadow Table

```sql
device_id  | desired                          | reported | version
-----------|----------------------------------|----------|--------
tank1      | {"light": "off", "pump": "off"} | {}       | 1
tank2      | {"light": "on", "pump": "on"}   | {...}    | 5
```

### RelayConfig Table (Already Complete)

```sql
relay_name | gpio_pin | active_level | default_state | device_id
-----------|----------|--------------|---------------|----------
light      | 4        | LOW          | off           | tank1
pump       | 12       | LOW          | off           | tank1
```

---

## MQTT Command Flow

```
Backend → Device:
Topic: tankctl/{device_id}/command
Payload: {
  "command": "set_pump",
  "value": "on",
  "version": 5
}

Device → Backend:
Topic: tankctl/{device_id}/reported
Payload: {
  "light": "on",
  "pump": "on"
}
```

---

## Validation Rules

### Command Validation

| Field | Rule | Example |
|-------|------|---------|
| command | Must start with "set_" | ✓ set_pump, ✓ set_relay_heater |
| value | Must be "on" or "off" | ✓ "on", ✗ "true", ✗ 1 |
| relay_name | Must exist in device config | ✓ pump (if configured), ✗ unknown_relay |

### Shadow State

| State | Valid | Example |
|-------|-------|---------|
| desired | Dict of relay→state | {"light": "on", "pump": "off"} |
| reported | Dict of relay→state | {"light": "on"} (may be partial) |
| version | Monotonic integer | 0, 1, 2, 3... (always increases) |

---

## Monitoring & Debugging

### Key Log Events

```
command_sending device_id=tank1 command=set_pump
relay_command_validated device_id=tank1 relay_name=pump value=on
command_sent device_id=tank1 command=set_pump relay_name=pump version=5

shadow_reconciliation_needed device_id=tank1 delta_keys=['pump'] version=4
shadow_delta_command_sent device_id=tank1 relay_name=pump command=set_pump version=5

relay_state_changed device_id=tank1 relay_name=pump from_state=off to_state=on
relay_state_changed_event_published device_id=tank1 relay_name=pump
shadow_synchronized_event_published device_id=tank1 version=5
```

### Debug Queries

```bash
# Find all commands for a device
grep "device_id=tank1" logs | grep command_sent

# Find pump-specific events
grep "relay_name=pump" logs

# Trace shadow reconciliation
grep "device_id=tank1.*shadow" logs | grep -E "(reconciliation|synchronized)"
```

---

## Deployment Checklist

- [x] CommandService relay validation added
- [x] ShadowService multi-relay reconciliation enhanced
- [x] DeviceService multi-relay initialization
- [x] API endpoints error handling improved
- [x] Tests written and passing
- [x] Backward compatibility verified
- [x] Logging standardized
- [x] Code review ready

---

## Next Steps (Phase 6)

- [ ] Implement relay-specific alert thresholds
- [ ] Add relay state history/telemetry
- [ ] Create relay scheduling (e.g., pump on/off schedule)
- [ ] Add relay dependency rules (e.g., pump off if water level low)

---

## Files Modified

| File | Changes |
|------|---------|
| src/services/command_service.py | Added relay validation, extraction |
| src/services/shadow_service.py | Enhanced multi-relay reconciliation, events |
| src/services/device_service.py | Multi-relay shadow initialization |
| src/api/routes/commands.py | Improved error handling (400/500) |
| tests/test_phase5_multi_relay.py | New comprehensive test suite |

---

## Implementation Status

✅ **COMPLETE** - All Phase 5 requirements implemented and tested.

Commits ready for:
1. `refactor(service): extend command service for multi-relay support`
2. `refactor(service): extend shadow reconciliation for multi-relay`
3. `refactor(service): initialize multi-relay shadow on device registration`
