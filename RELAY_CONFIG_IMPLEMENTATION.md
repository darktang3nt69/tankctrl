# Relay Configuration Implementation - Phase 2-3 Complete

## Implementation Summary

✅ **Phase 2: Repository Layer** - CRUD operations for relay configs  
✅ **Phase 3: Service Layer** - Business logic and validation  
✅ **Phase 3B: API Schemas** - Request/response models with validation  
✅ **Phase 3C: API Routes** - REST endpoints for relay management  
✅ **Phase 3D: Router Registration** - Integrated into main FastAPI app  

---

## Recommended Git Commits

### Commit 1: Repository Layer
```bash
git add src/repository/relay_config_repository.py
git commit -m "feat(repository): add relay config CRUD operations

- Implement RelayConfigRepository with full CRUD methods
- Add GPIO pin conflict detection and validation
- Support per-device relay uniqueness constraints
- All operations with transaction handling and rollback
- Structured logging for all database operations"
```

### Commit 2: Service Layer
```bash
git add src/services/relay_config_service.py src/services/device_service.py
git commit -m "feat(service): add relay configuration service

- Implement RelayConfigService with business logic layer
- Auto-register default relays on device setup (light:D4, pump:D12)
- Add push_config_to_device() for MQTT config distribution
- Comprehensive validation with (bool, message) tuple return
- Device existence verification before all operations
- Integrate default relay registration into device registration flow"
```

### Commit 3: API Schemas
```bash
git add src/api/schemas.py
git commit -m "feat(api): add relay configuration request/response schemas

- Add RelayConfigRequest schema with strict validation
- Add RelayConfigResponse schema with timestamps
- Add DeviceRelayConfigResponse for list endpoint
- Enforce GPIO range (0-39), active_level literal, default_state literal
- Alphanumeric relay_name validation (underscores allowed)"
```

### Commit 4: API Endpoints
```bash
git add src/api/routes/relay_config.py src/api/main.py
git commit -m "feat(api): add relay configuration REST endpoints

- Implement GET /devices/{device_id}/relays - List all relays
- Implement POST /devices/{device_id}/relays - Create relay (201)
- Implement PATCH /devices/{device_id}/relays/{relay_name} - Update relay (200)
- Implement DELETE /devices/{device_id}/relays/{relay_name} - Delete relay (204)
- Implement POST /devices/{device_id}/relays/push-config - Push config via MQTT (202)
- All endpoints with proper HTTP status codes and error handling
- Register relay_config router in main FastAPI app"
```

### Commit 5: Infrastructure Support
```bash
git add src/infrastructure/mqtt/mqtt_topics.py
git commit -m "feat(mqtt): add config topic for relay configuration push

- Add config_topic(device_id) method to MQTTTopics
- Enable publishing relay configs to tankctl/{device_id}/config
- Supports JSON serialization of relay configurations"
```

---

## Architecture Overview

```
API Layer (FastAPI)
  ├─ GET /devices/{device_id}/relays
  ├─ POST /devices/{device_id}/relays
  ├─ PATCH /devices/{device_id}/relays/{relay_name}
  ├─ DELETE /devices/{device_id}/relays/{relay_name}
  └─ POST /devices/{device_id}/relays/push-config
         ↓ (JSON + Pydantic schemas)
Service Layer
  ├─ RelayConfigService.create_relay_config()
  ├─ RelayConfigService.update_relay_config()
  ├─ RelayConfigService.delete_relay_config()
  ├─ RelayConfigService.get_device_relay_config()
  ├─ RelayConfigService.push_config_to_device()
  ├─ RelayConfigService.validate_relay_config() → (bool, str)
  └─ RelayConfigService.register_default_relays()
         ↓ (domain models)
Repository Layer
  ├─ RelayConfigRepository.create_relay()
  ├─ RelayConfigRepository.update_relay()
  ├─ RelayConfigRepository.delete_relay()
  ├─ RelayConfigRepository.get_relay()
  ├─ RelayConfigRepository.get_device_relays()
  └─ RelayConfigRepository.validate_relay_config()
         ↓ (SQLAlchemy ORM)
Infrastructure Layer
  ├─ Database: RelayConfigModel (device_relay_config table)
  ├─ MQTT: config_topic(device_id) publisher
  └─ DeviceService: Auto-registration on device creation
```

---

## Key Features

### Default Relay Registration
When a device is registered, two relays are automatically created:
```python
light:
  gpio_pin: 4          # D4 on ESP32
  active_level: LOW    # Active-low sinking logic
  default_state: off

pump:
  gpio_pin: 12         # D12 on ESP32
  active_level: LOW    # Active-low sinking logic
  default_state: off
```

### Validation & Constraints

**GPIO Constraints**:
- ESP32 supports pins 0-39
- Per-device uniqueness enforced via `UNIQUE(device_id, gpio_pin)`
- Per-relay uniqueness enforced via `UNIQUE(device_id, relay_name)`

**Field Constraints**:
- `relay_name`: 1-50 chars, alphanumeric + underscore
- `active_level`: "LOW" or "HIGH" literal
- `default_state`: "on" or "off" literal
- `gpio_pin`: 0-39 integer

**Business Logic**:
- Validation at domain model level (RelayConfig.__post_init__)
- Validation at service level (RelayConfigService.validate_relay_config)
- Conflict detection at repository level
- Returns (bool, message) tuple for error details

### MQTT Configuration Push

**Endpoint**: `POST /devices/{device_id}/relays/push-config`

**Topic**: `tankctl/{device_id}/config`

**Payload Format**:
```json
{
  "light": {
    "relay_name": "light",
    "gpio_pin": 4,
    "active_level": "LOW",
    "default_state": "off"
  },
  "pump": {
    "relay_name": "pump",
    "gpio_pin": 12,
    "active_level": "LOW",
    "default_state": "off"
  }
}
```

---

## Testing Checklist

- [ ] List relays for device with no relays
- [ ] Create relay with valid configuration
- [ ] Attempt create relay with duplicate relay_name → 409 Conflict
- [ ] Attempt create relay with GPIO conflict → 400 Bad Request
- [ ] Attempt create relay on non-existent device → 404 Not Found
- [ ] Update relay with new GPIO pin
- [ ] Delete relay → 204 No Content
- [ ] Attempt delete non-existent relay → 404 Not Found
- [ ] Push config to device → 202 Accepted (MQTT published)
- [ ] Attempt push config for device with no relays → 400 Bad Request
- [ ] Verify default relays auto-created on device registration
- [ ] Verify MQTT payload format is valid JSON
- [ ] Verify all operations are logged with device_id and relay_name

---

## Error Handling Examples

**Device Not Found**
```
GET /devices/nonexistent/relays
→ 404 Device nonexistent not found
```

**Relay Already Exists**
```
POST /devices/tank1/relays
  { "relay_name": "light", "gpio_pin": 4, ... }
→ 409 Relay 'light' already exists for device tank1
```

**GPIO Conflict**
```
POST /devices/tank1/relays
  { "relay_name": "pump", "gpio_pin": 4, ... }
→ 400 GPIO pin 4 is already used by relay 'light'
```

**Invalid GPIO Pin**
```
POST /devices/tank1/relays
  { "relay_name": "heater", "gpio_pin": 50, ... }
→ 400 GPIO pin 50 is invalid for ESP32 (0-39)
```

---

## Integration Points

### Device Service
- `DeviceService.register_device()` now calls `RelayConfigService.register_default_relays()`
- Default relays created alongside device, shadow, and light schedule

### MQTT Client
- Config topic published via `mqtt_client.publish(topic, json.dumps(payload), qos=1, retain=True)`
- Retained message ensures device gets config on reconnect

### Commands vs Relay Config
- **Commands**: Control device state (set_light on/off) via command topic
- **Relay Config**: Configure GPIO mapping and default states via config topic

---

## Files Modified/Created

**Created**:
- ✅ `src/repository/relay_config_repository.py`
- ✅ `src/services/relay_config_service.py`
- ✅ `src/api/routes/relay_config.py`

**Modified**:
- ✅ `src/api/schemas.py` (added 3 new schemas)
- ✅ `src/api/main.py` (registered relay_config router)
- ✅ `src/services/device_service.py` (integrated auto-registration)
- ✅ `src/infrastructure/mqtt/mqtt_topics.py` (added config_topic method)

---

## Database Schema

**Table**: `device_relay_config`

```sql
id                INT PRIMARY KEY AUTOINCREMENT
device_id         VARCHAR(50) NOT NULL, INDEX
relay_name        VARCHAR(50) NOT NULL
gpio_pin          INT NOT NULL
active_level      VARCHAR(10) NOT NULL, DEFAULT='LOW'
default_state     VARCHAR(10) NOT NULL, DEFAULT='off'
created_at        DATETIME NOT NULL, DEFAULT=UTCNOW()
updated_at        DATETIME NOT NULL, DEFAULT=UTCNOW()

UNIQUE CONSTRAINT: (device_id, relay_name)
UNIQUE CONSTRAINT: (device_id, gpio_pin)
```

---

## Next Steps (Phase 4+)

- [ ] Add relay state control endpoints (set relay on/off)
- [ ] Add relay state reporting from devices
- [ ] Implement relay health checks and diagnostics
- [ ] Add relay binding to device shadow state
- [ ] Create relay configuration templates for device types
