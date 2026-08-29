# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

TankCtl is a self-hosted IoT controller for water-tank devices (pump, light, relays, sensors): a FastAPI + MQTT Python backend, Arduino/ESP32 firmware, and (not yet built) a Next.js web UI. Devices talk to the backend exclusively over MQTT using a device-shadow (desired vs. reported state) pattern with versioned, idempotent commands.

## Commands

```bash
# Local run (outside Docker — edit .env hosts to localhost first)
pip install -r requirements.txt
cp .env.example .env
python -m src.main

# Docker (recommended)
docker compose up -d
docker exec -i tankctl-postgres psql -U tankctl -d tankctl < migrations/00X_*.sql   # run any new/unapplied migration files in order

# Tests (pytest not in requirements.txt — install separately: pip install pytest)
pytest tests/
pytest tests/test_shadow_reconciliation.py::ShadowServiceReconciliationTests::test_reconcile_shadow_sends_command_when_no_inflight_match  # single test
```

There is no lint/type-check config and no CI workflow in this repo — don't invent one.

Migrations are plain numbered `.sql` files with no migration-tracking table/runner — applying them is manual (`psql < file`) and the repo already has two number collisions (`003_*`, `011_*`), so check existing filenames before adding a new one rather than trusting the highest number to be unique.

## Architecture

Strict layering, enforced by convention (no framework boundary): `API (FastAPI routes) → Services (business logic) → Domain (pure dataclasses) → Repository (DB access) → Infrastructure (MQTT/DB/scheduler/events)`. Routes must never touch MQTT or the DB session directly — go through a service.

- **Device shadow**: `ShadowService` reconciles `desired` vs `reported` state per device (`domain/device_shadow.py`), publishing a command when they differ. Reconciliation is also re-run periodically by the scheduler and immediately on a `reported` MQTT message.
- **Commands**: versioned (`domain/command.py`); devices must ignore commands with a stale version. Status flows `pending → sent → executed/failed`.
- **MQTT** (`infrastructure/mqtt/`): topics are `tankctl/{device_id}/{command,reported,telemetry,heartbeat,status}`. `handlers.py` has one handler class per inbound topic, registered in `src/api/main.py`'s lifespan.
- **Event system** (`infrastructure/events/`) — not mentioned in README.md/agents.md: an internal `event_publisher` pub/sub bus feeds both `event_store` (persists to the `events` table) and `websocket_manager` (pushes live updates to web/UI clients over the `live` route). Alert rules (`AlertService`) subscribe to this bus rather than polling telemetry.
- **Scheduler** (`infrastructure/scheduler/`, APScheduler): shadow reconciliation, offline detection, light-schedule on/off firing, water-schedule reminders — all periodic jobs, configured via `SchedulerSettings`.
- **Firmware**: two device targets exist side by side — `firmware/Arduino Uno EK R4 Wifi/` and `firmware/esp32/` (see its own `MQTT_PROTOCOL_v2.0.md` and `PINOUT.md`). Don't assume they share firmware code; check which board a task targets.
- **Web frontend**: `agents.md` and `.github/agents/*.agent.md` describe a Next.js app (`tankctl-web/`) in detail, but it does not exist in this repo yet (the old Flutter/Android app was removed per git history; the web UI is a fresh rebuild not yet started). Treat those docs as a target design, not current code.

## Known divergences from the docs

`README.md` and `agents.md` describe an earlier/idealized schema and route set — they now carry a pointer note to `migrations/` and `src/api/routes/` as the authoritative source rather than trying to stay in exact sync (DB and API surface have both grown substantially: `device_push_tokens`, `warning_acknowledgements`, `light_schedules`, `water_schedules`, `firmware_releases`/`firmware_deployments`, `device_relay_config` tables; water-schedule, relay-config, push-token, live/WebSocket, and warning-ack routes).
- `.github/copilot-instructions.md` tells Copilot to consult a `graphify` code-graph tool (`graphify query/path/explain`) — `graphify-out/` does not exist in this repo, but the instruction is already gated behind "when `graphify-out/graph.json` exists", so it's inert rather than wrong.

`src/api/routes/device_routes.py` (dead, unwired duplicate of `devices.py`) has been deleted. Migration number collisions (`003`, `011`) have been resolved: the duplicate `011_*_prefs.sql` was merged into `011_*_preferences.sql` (now idempotent with `IF NOT EXISTS`), and `003_create_device_push_tokens.sql` was renumbered to `013_*`.

`.github/agents/*.agent.md` (14 files: planner, orchestrator, backend-core, device-communication, esp32-firmware, notifications-and-alerts, frontend-core, state-management, ui-components, real-time-features, api-integration, web-deployment, code-cleanup, docs-automation) are GitHub Copilot custom chat-mode agents, not Claude Code subagents — you can't invoke them via the Task tool, but they're worth reading directly when you need deep domain context for one of those areas (e.g. `esp32-firmware.agent.md` for memory/watchdog constraints).

## Tests

Mixed style: most `tests/*.py` use `unittest.TestCase` (run fine under pytest), one (`test_water_schedule_reminders.py`) uses bare pytest functions/fixtures. Tests import as `from src...`, so run them from the repo root.

## Assistant tooling active in this repo

- **ponytail** — default coding style here: smallest working diff, stdlib/native/existing-dependency first, no speculative abstractions. Applies to all code changes unless you ask for the full version of something.
- **superpowers** — brainstorming before new features, systematic-debugging before bug fixes, TDD for implementation work; invoked automatically when the task matches.
- **claude-mem** — persistent memory across sessions for this repo; past decisions/plans/errors are searchable rather than re-derived each time.
