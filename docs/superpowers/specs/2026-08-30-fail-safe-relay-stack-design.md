# Fail-Safe Relay Stack — Design

Status: approved for implementation planning
Date: 2026-08-30
Source: gap analysis against `docs artifact "Aquarium Control Architecture"` (design spec, not yet built)

## Context

The architecture spec at (artifact caf5a3a1) describes a fail-safe design for
relay control: the backend owns intent, the device owns execution and never
needs network permission to do the safe thing. A gap check against the
current `tankctl` codebase found the shadow/versioning/reconciler skeleton
real, but everything that actually makes the system fail-safe missing:
per-relay contract fields, on-device RTC/schedule/watchdog, and MQTT ACLs.

This spec covers four independent sub-projects, buildable in parallel:

- **A** — per-relay fail-safe contract (backend: DB + API)
- **B** — firmware safety stack (ESP32: RTC, local schedule, hard cutoff, time_unknown)
- **C** — MQTT ACL (broker + backend credential issuance + firmware + dev tooling)
- **D** — migrations housekeeping (delete dead migration files, models become the real schema source)

Explicitly out of scope for this pass (per earlier scoping decision):
control-plane/data-plane process split for telemetry (spec item D) — dropped,
no evidence of actual load pain yet.

## A — Per-relay fail-safe contract

### Data model

**Important discovery from the housekeeping audit (part D):** the numbered
`migrations/*.sql` files are not what actually creates most tables at
runtime. `src/infrastructure/db/database.py:init_db()` calls
`Base.metadata.create_all(...)` against the SQLAlchemy models in
`src/infrastructure/db/models/__init__.py`, and those models are already
the current, final shape — including `RelayConfigModel`. The migration
file (`012_create_relay_config_table.sql`) is now just a documentation
artifact, not the live schema source.

So the real change is on `RelayConfigModel`
(`src/infrastructure/db/models/__init__.py`):

```python
fail_safe_default = Column(String(10), nullable=False)
cutoff_ceiling_seconds = Column(Integer, nullable=True)
```

plus a `CheckConstraint` in `__table_args__` for both (`fail_safe_default
IN ('on','off')`, `cutoff_ceiling_seconds IS NULL OR > 0`). No column
default on `fail_safe_default` — matches the spec's provisioning rule
("no relay ships on the global default"). `cutoff_ceiling_seconds` nullable
= no ceiling (e.g. filter/pump, fails open). The API key stays required in
the request payload (can carry an explicit `null`) so a caller can't
silently omit the decision.

`migrations/012_create_relay_config_table.sql` gets updated to match (for
anyone reading migrations/ as documentation) but is not what anything
actually runs — see part D.

### Domain / service / API

- `src/domain/relay_config.py`: add `fail_safe_default: str` (required) and
  `cutoff_ceiling_seconds: int | None` (required key, nullable value) to
  `RelayConfig`, with `__post_init__` validation matching the DB constraints.
- `src/api/schemas.py` (`RelayConfigRequest`/`RelayConfigResponse`): add both
  fields, `fail_safe_default` required, `cutoff_ceiling_seconds: int | None`
  required key.
- `src/services/relay_config_service.py` (`create_relay_config`,
  `update_relay_config`): pass through, no defaulting.
- `src/repository/relay_config_repository.py`: persist/read both columns.

### Dynamic light ceiling

The `light` relay's ceiling should track whatever schedule is active
(user wants this frontend-controllable later, so it can't be a value set
once at provisioning and forgotten).

- Wherever `light_schedules` is created/updated (existing scheduling
  service), after a successful write: recompute
  `cutoff_ceiling_seconds = (schedule_off - schedule_on) + 1800` for that
  device's `light` relay row, persist it, and call the existing
  `push_config_to_device` path so the new ceiling reaches the device.
- If a device has no `light` relay configured, skip silently (not an error
  — not every device has a light).
- If `schedule_off <= schedule_on` (overnight-spanning schedule), compute
  duration accounting for wraparound (`(schedule_off - schedule_on) % 86400`).

Other relay classes (heater, pump, etc.) keep whatever flat
`cutoff_ceiling_seconds` was set at provisioning — no auto-recompute.

### Testing

pytest, matching repo convention (`tests/`, `unittest.TestCase` style seen
elsewhere): validation rejects missing/invalid fail_safe_default, accepts
null cutoff_ceiling, light ceiling recompute triggers on schedule change and
math is correct including overnight wraparound.

## B — Firmware safety stack

Target: `firmware/esp32/tankctl_esp32.ino`. No RTC hardware in hand yet
(DS3231 module ordered but not arrived) — this code is written and
logic-reviewed now, hardware-verified later. No test harness for firmware
(explicit user decision — repo has no PlatformIO/CI, skip is fine here).

### Layer 1 — RTC

- Library: RTClib (Adafruit), DS3231 over I2C (SDA/SCL, ESP32 native I2C,
  module runs at 3.3V so no level shifter).
- On boot: init RTC, check `rtc.lostPower()` — if true, RTC has no valid
  time (dead battery or first boot). Feeds directly into the `time_unknown`
  path below.

### Layer 2 — local schedule engine

- Schedule (on-time, off-time for the light relay) received via the
  existing relay-config MQTT push, cached to flash (`Preferences`
  namespace), independent of live MQTT connection once cached.
- Main loop ticks every 1s: read RTC time, compare against cached schedule,
  drive light relay directly. Never blocks on network.
- On boot with no cached schedule and no fresh push received: light relay
  goes to `fail_safe_default` (not "leave whatever GPIO state it booted
  into") until a schedule arrives.

### Layer 3 — independent hard-cutoff watchdog

Separate code path from Layer 2 — not a variant of the same scheduler
function, a second independent timer. Per relay with a non-null
`cutoff_ceiling_seconds`: tracks continuous-on duration from a separate
counter (starts counting the moment the relay is energized, by whatever
caused it — schedule, command, boot default). Past the ceiling, force the
relay off directly at the GPIO level, regardless of what Layer 2 or an
inbound command says. Reset the counter only when the relay actually
transitions to off.

### `time_unknown` status

Trigger conditions (either one): `rtc.lostPower()` true on boot, or the
cached flash schedule fails a checksum. On trigger:

- Every relay with a fail-safe contract forced to its `fail_safe_default`
  immediately (does not wait for Layer 3's timer — this is a boot-time
  action, not a runaway-detection action).
- Device publishes a distinct status value `time_unknown` on the existing
  status/heartbeat topic (not the normal "online") — the backend should be
  able to tell "device is up but doesn't trust its own clock" apart from
  "device is up and fine."
- Device does not resume the cached schedule on a guess. It stays in
  `time_unknown` until it gets a real time fix (NTP once Wi-Fi is up, or a
  fresh config push confirms schedule integrity) — at which point it
  re-evaluates Layer 2 normally and reports normal status.

### Backend recognition (small, in C's/A's territory but listed here since it's the receiving end)

- MQTT status handler (`src/infrastructure/mqtt/handlers.py`) accepts
  `time_unknown` as a valid status value distinct from online/offline.
- No new alert class required for this pass — surfacing the status is
  enough; escalation policy can follow later if it proves noisy or missed.

## C — MQTT ACL

### Broker (`mosquitto.conf`)

```
allow_anonymous false
password_file /mosquitto/config/passwd
acl_file /mosquitto/config/acl
```

Backend's existing shared credential (already in `.env`/`settings.py`) gets
full topic access in the ACL file. Per-device credentials get:

```
user <device_id>
topic readwrite tankctl/<device_id>/#
```

### Credential issuance

- On device registration (`src/services/device_service.py` register flow):
  generate a random password, store the device's MQTT username (=
  `device_id`) and password. Simplest storage matching this repo's size:
  write directly into the mosquitto passwd file via `mosquitto_passwd -b`
  (already correct hash format, no reimplementation of the hashing scheme)
  and append the matching ACL stanza to the acl file, then have the broker
  reload (`mosquitto` supports SIGHUP for config reload, or a docker
  `restart`/`kill -HUP` on the mosquitto container — check what's already
  wired in `docker-compose.yml`).
- Password returned once at registration time (API response), not stored
  retrievably in plaintext elsewhere — same handling class as an API key.

### Firmware

- Per-device creds baked into build config (`secrets.h`-style header, not
  committed — matches existing `.env`-not-committed pattern). No
  fleet-provisioning system — revisit only once there's an actual fleet to
  provision, not before.

### Dev tooling fallout

`tools/device_simulator.py`, `tools/integration_test.py`,
`tools/reconciliation_demo.py` currently assume anonymous MQTT connect —
update each to take/use device credentials, otherwise local dev breaks the
moment `allow_anonymous false` lands. Check `docker-compose.yml` for
whether Mosquitto's password/acl files need to be bind-mounted (they
currently aren't, since anonymous was fine).

### Verification

A script (new, under `tools/`) that:

1. Registers two devices (or reuses two known ids), gets each a credential.
2. Connects as device A, publishes to device A's own command-response topic
   — succeeds.
3. Connects as device A, attempts publish/subscribe on device B's topic —
   must be denied (broker refuses or silently drops depending on Mosquitto
   ACL behavior — assert the observable outcome, e.g. subscribe grant
   failure or no message delivery).
4. Prints pass/fail per check — this is a manual/CI-adjacent check script,
   not a pytest test (needs a live broker).

## D — Migrations housekeeping

### Finding

`database.py:init_db()` runs `Base.metadata.create_all` against the models
in `src/infrastructure/db/models/__init__.py`, which already reflect the
final, current schema for every table they cover — `DeviceModel` already
has `uptime_ms`/`rssi`/`wifi_status`/`temp_threshold_low`/`temp_threshold_high`/
`device_name`/`location`/`icon_type`/`description`; `LightScheduleModel`
already uses `on_time`/`off_time`; `WaterScheduleModel` already has
`days_of_week` and the `notify_*` columns; `WarningAcknowledgementModel`,
`DevicePushTokenModel`, `RelayConfigModel` all exist and match current
shape. This makes migrations 002, 003, 004, 005, 006, 007, 008, 009, 011,
013 dead on a fresh database — pure historical record of ALTERs once run
against a live DB before the models caught up.

Two files are still load-bearing:

- **001** (`create_telemetry_table.sql`) — genuinely run every startup by
  `_init_timescale_schema()` (`database.py:84`), raw SQL because
  TimescaleDB hypertable/extension setup isn't ORM-expressible.
- **010** (`create_firmware_table.sql`) — `firmware_releases` and
  `firmware_deployments` have no SQLAlchemy model at all, so `create_all`
  skips them; this is the one genuine manual-apply gap.

### Changes

1. Delete `migrations/002_*.sql` through `009_*.sql`, `011_*.sql`,
   `013_*.sql` (the ones fully absorbed into current models). Acceptable
   since no production data depends on replaying them.
2. Add `FirmwareReleaseModel` and `FirmwareDeploymentModel` to
   `src/infrastructure/db/models/__init__.py`, matching the columns in
   `010_create_firmware_table.sql`, and add both to the `create_all` table
   list in `database.py:init_db()`. This makes migration 010 dead too, but
   *keep the file* — unlike the others, nothing yet re-derives it from a
   model, so leave it as the documented origin until someone confirms the
   new models produce an identical table (drop it in a later pass, not
   this one).
3. Update `012_create_relay_config_table.sql` to match the new
   `fail_safe_default`/`cutoff_ceiling_seconds` columns from part A, for
   documentation consistency, while making clear (comment at the top of
   the file) that `RelayConfigModel` is the actual source of truth.
4. `migrations/001_*.sql` stays as-is, permanently — the one legitimate
   non-ORM case.
5. Note in the relevant CLAUDE.md section (or leave a short comment in
   `migrations/`) that most schema now lives in `models/__init__.py`, so a
   future contributor doesn't add a 12th dead migration file out of habit.

No new tests needed — this is a deletion/consolidation pass, verified by
running `init_db()` against a fresh database and confirming every table
and column used elsewhere in the codebase exists.

## Cross-cutting

- A and C are backend-only (Python), fully parallel to B (firmware, C++).
- C's firmware credential piece depends on nothing from B, can land
  independently; B's RTC/schedule/watchdog piece doesn't depend on C at all.
- A's dynamic light-ceiling piece touches the scheduling service that
  already exists — no new service, extend in place.
- **D should land before or alongside A**, not after: A's own data-model
  change (part A) already targets `RelayConfigModel` as the real schema
  source rather than the migration file, which only makes sense once D's
  finding is applied. Doing D first (or in the same pass) avoids A briefly
  editing a migration file that D is about to declare dead.
- D touches no runtime behavior — pure deletion/consolidation, safe to run
  fully in parallel with B and C, and safe to land independently of
  whether A/B/C ship in this pass or not.
