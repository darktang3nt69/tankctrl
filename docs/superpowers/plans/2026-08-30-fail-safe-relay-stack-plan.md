# Fail-Safe Relay Stack — Implementation Plan

Spec: `docs/superpowers/specs/2026-08-30-fail-safe-relay-stack-design.md`

Three parallel tracks, split by file ownership (no two agents touch the
same file):

## Track 1 — Backend schema (D + A)

Owns: `src/infrastructure/db/models/__init__.py`, `src/infrastructure/db/database.py`,
`src/domain/relay_config.py`, `src/api/schemas.py` (relay parts only),
`src/services/relay_config_service.py`, `src/repository/relay_config_repository.py`,
`src/services/scheduling_service.py` (light schedule → ceiling recompute),
`migrations/002` through `009`, `011`, `012`, `013`.

1. Delete `migrations/002_*.sql` .. `009_*.sql`, `011_*.sql`, `013_*.sql`.
2. Add `FirmwareReleaseModel`/`FirmwareDeploymentModel` to `models/__init__.py`
   (columns match `migrations/010_create_firmware_table.sql`), add both to
   the `create_all` table list in `database.py:init_db()`. Keep
   `migrations/010_*.sql` on disk as documented origin.
3. Add `fail_safe_default` (String(10), NOT NULL, no default) and
   `cutoff_ceiling_seconds` (Integer, nullable) to `RelayConfigModel`, with
   CHECK constraints (`fail_safe_default IN ('on','off')`,
   `cutoff_ceiling_seconds IS NULL OR > 0`).
4. Update `migrations/012_create_relay_config_table.sql` to match (docs
   only), add a header comment noting `RelayConfigModel` is the real
   source of truth.
5. `src/domain/relay_config.py`: add both fields + `__post_init__`
   validation mirroring the DB constraints.
6. `src/api/schemas.py`: add both fields to `RelayConfigRequest`/
   `RelayConfigResponse`, `fail_safe_default` required, `cutoff_ceiling_seconds`
   required key (nullable value).
7. `relay_config_service.py` / `relay_config_repository.py`: thread both
   fields through create/update/read, no defaulting.
8. `scheduling_service.py` (wherever `light_schedules` writes happen):
   after a successful schedule create/update, recompute the `light` relay's
   `cutoff_ceiling_seconds = (off_time - on_time) [wraparound-safe] + 1800`,
   persist, call existing `push_config_to_device`. Skip silently if device
   has no `light` relay.
9. pytest coverage: validation rejects missing/invalid `fail_safe_default`,
   accepts null `cutoff_ceiling_seconds`, ceiling recompute math correct
   including overnight wraparound.
10. Verify: fresh `init_db()` against an empty database produces every
    table/column the rest of the codebase reads (run app locally, check).

## Track 2 — MQTT ACL, backend + broker + tooling (C minus firmware)

Owns: `mosquitto.conf`, `docker-compose.yml`, `src/services/device_service.py`,
`tools/device_simulator.py`, `tools/integration_test.py`,
`tools/reconciliation_demo.py`, new `tools/verify_mqtt_acl.py`.

1. `mosquitto.conf`: `allow_anonymous false`, add `password_file`/`acl_file`
   directives.
2. `docker-compose.yml`: bind-mount password/acl files into the mosquitto
   container if not already mounted.
3. Backend's existing shared MQTT credential (`.env`/`settings.py`) gets a
   full-access ACL entry.
4. `device_service.py` register flow: generate random password on device
   registration, write username=`device_id` + password via
   `mosquitto_passwd -b` into the password file, append
   `user <device_id>` / `topic readwrite tankctl/<device_id>/#` to the ACL
   file, trigger broker reload (check `docker-compose.yml` for how
   mosquitto is run — SIGHUP or container restart). Return the password
   once in the registration API response, don't store it retrievably
   elsewhere.
5. Update `tools/device_simulator.py`, `tools/integration_test.py`,
   `tools/reconciliation_demo.py` to use per-device credentials instead of
   anonymous connect — otherwise local dev breaks.
6. New `tools/verify_mqtt_acl.py`: registers two devices, connects as
   device A, confirms publish/subscribe to A's own topics works and to
   B's topics is denied. Print pass/fail per check.
7. Run the verify script against the local docker-compose stack, confirm
   it reports all checks passing.

## Track 3 — Firmware (B + C's firmware half)

Owns: `firmware/esp32/tankctl_esp32.ino` (and any new `.h` files it adds).

1. Layer 1 — RTC: add DS3231 driver (RTClib) over I2C, init on boot, check
   `rtc.lostPower()`.
2. Layer 2 — local schedule engine: cache pushed schedule to flash
   (`Preferences`), 1s tick against RTC, drive light relay with zero MQTT
   dependency once cached. No cached schedule + no fresh push yet → relay
   goes to `fail_safe_default`.
3. Layer 3 — independent hard-cutoff watchdog: separate code path from
   Layer 2, per-relay continuous-on timer against `cutoff_ceiling_seconds`
   from pushed config, force-off past ceiling regardless of scheduler or
   inbound commands.
4. `time_unknown`: on `rtc.lostPower()` or flash schedule checksum
   failure — force every contracted relay to `fail_safe_default`
   immediately, publish `time_unknown` status on the existing
   status/heartbeat topic instead of normal online. Stay in that state
   until a real time fix (NTP or fresh config push confirms integrity)
   before resuming Layer 2 normally.
5. MQTT credentials: per-device username/password baked into a
   `secrets.h`-style header (not committed), used in the
   WiFiClient/PubSubClient connect call instead of anonymous connect.
6. No test harness (explicit scope decision) — logic reviewed by hand,
   hardware-verified once the DS3231 module arrives.

## Backend status recognition (small, Track 1 or 2, whichever lands first)

`src/infrastructure/mqtt/handlers.py`: accept `time_unknown` as a valid
device status value distinct from online/offline. No new alert class this
pass.

## Sequencing note

Track 1 should be treated as landing first conceptually (D's finding is
what makes A's "edit the model, not the migration" approach correct) but
all three tracks can be coded in parallel — they don't share files, only
share a conceptual dependency that doesn't block independent authoring.
