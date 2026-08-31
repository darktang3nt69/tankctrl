# TankCtl Dashboard — Playwright MCP Validation

## Validation target

The frontend implementation described in [`01_spec.md`](./01_spec.md) — `tankctl-web/`, a React + TypeScript + Vite SPA: Overview, Tank Detail (Light/Relays/Water/Commands tabs), Alerts, Settings, and the real-time/data layer (`LiveEventsProvider`, TanStack Query hooks).

**Update since the last pass**: the backend is now actually reachable. The Docker Desktop blocker from the previous two rounds (`F:\` not shared, so mosquitto's bind mount failed and the backend container that depends on mosquitto being healthy couldn't start) is fixed — not worked around by asking the user to change a setting, but fixed from this session by converting the affected bind mounts to named volumes seeded via `docker cp` (which doesn't go through the broken host bind-mount path). Full details under Checks/Results below. This pass validates the real app against real, live backend data for the first time.

## Preconditions / environment

- `docker compose ps`: all 6 services `Up ... (healthy)` — `postgres`, `timescaledb`, `mosquitto`, `mqttx-web`, `grafana`, `backend`.
- `GET http://localhost:8000/health` → `{"status":"healthy", ...}`.
- `GET http://localhost:8000/openapi.json` confirms the water-schedule schema now matches source exactly: `schedule_type` enum is `["weekly","custom","interval"]`, `interval_days`/`ph`/`ammonia`/`nitrite`/`nitrate`/`tds` all present — migration `013_extend_water_schedules.sql` applied automatically (backend's `entrypoint.sh` runs every `migrations/*.sql` file against Postgres on every container start; not the manual `psql` step `CLAUDE.md` describes for this repo in general, but true for this file given that entrypoint loop).
- Real data already exists in Postgres from earlier testing: 5 devices (`tank1`, `acltest-a-0mfypq`, `acltest-b-0mfypq`, `manualtest-a`, `manualtest-b`), `tank1` has telemetry, command history, and two configured relays (`light` GPIO4, `pump` GPIO12).
- `tankctl-web` dev server still running at `localhost:5173`.

## Checks attempted

1. **Fixed the Docker blocker** (see Results for the exact steps) rather than re-reporting it, then verified all 6 containers healthy.
2. Re-fetched `/openapi.json` to confirm the water-schedule schema is no longer stale.
3. Re-loaded Overview in Playwright against live data — checked console, took a full-page screenshot.
4. Ground-truth-checked every other endpoint the frontend calls (`/devices/{id}/detail`, `/relays`, `/shadow`, `/water-schedules`, `/commands`, `/telemetry`, `/telemetry/hourly/summary`, `/events`, `/events/types`) directly against the live backend to catch any other wrong assumptions before more Playwright clicking — this is what caught the bug below.
5. Re-loaded Overview in Playwright after the fix — console + screenshot.
6. Navigated to `/tanks/tank1` and checked the Light, Water, and Relays tab panels against real data — console + screenshots each time.
7. Investigated an apparent anomaly (the URL's `?tab=` query param changing between some of my checks with no click issued by me) before concluding it wasn't an app defect.

## Results

- **Docker blocker fixed.** `docker-compose.yml`: the `mosquitto` and `backend` services' `./mosquitto-auth` bind mount is now a named volume (`mosquitto_auth`), seeded once via `docker cp mosquitto-auth/{passwd,acl} tankctl-mosquitto:/mosquitto/config/auth/` — `docker cp` streams over the Docker API rather than going through the host bind-mount path, so it works even though this Docker Desktop install can't bind-mount anything from `F:\`. The `./google-services.json` bind mount on `backend` was removed (the file doesn't exist in this repo and would hit the same broken-mount problem) — commented in the compose file with instructions to reinstate it once a real Firebase credentials file exists. All 6 containers came up healthy after this.
- **One real bug found and fixed**: `useDevices()` in `src/api/devices.ts` typed `GET /devices` as returning `Device[]` directly. The live response is actually `{"count": 5, "devices": [...]}`. This crashed Overview (`TypeError: list is not iterable` inside the search/filter `useMemo`'s `[...list]` spread) the moment real data existed — invisible in every earlier check because the backend had been down or returning nothing that exercised this path until now. Fixed by unwrapping `.devices` in the query function. Confirmed fixed: Overview now renders all 5 tanks, 0 console errors.
- **Ground-truth check of every other endpoint against live responses**: all matched the TypeScript types exactly — `detail`, `relays`, `shadow`, `water-schedules`, `commands`, `telemetry`, `telemetry/hourly/summary`, `events`, `events/types`. No further contract mismatches found.
- **Tank Detail validated against real data**:
  - **Light tab**: manual on/off buttons and the schedule form render correctly (this device has no light schedule row, so 06:00/18:00 defaults show, as designed).
  - **Relays tab**: both real relays (`light` GPIO4, `pump` GPIO12) render with their live shadow-reported state (`reported: off` / `reported: on`) — matches `GET /devices/tank1/shadow` exactly. On/Off/Edit/Delete controls all present.
  - **Water tab**: correctly shows the "No water schedules yet" empty state (this device has none) plus a real, correctly-dated August 2026 calendar grid.
  - **Live temp/humidity charts correctly show "No data yet"** for the Live (last-1-hour) range — this device's telemetry is ~8.5 hours old (seeded during earlier testing, no live device streaming), so an empty live chart is the *correct* behavior, not a bug; the hourly-rollup endpoint (used by the 7d/30d ranges) does have this same data available.
  - Sidebar connection pill correctly shows **"Live"** (green) once the WebSocket could actually connect, versus "Reconnecting" (amber) in every prior round when the backend was down — the honest-staleness behavior now demonstrated in both states.
- **Investigated, not a bug**: during this round the Tank Detail URL's `?tab=` parameter changed between several of my checks without my issuing any click. Code review confirms the only code path that changes it (`handleTabChange` in `TankDetail.tsx`) is wired to an explicit button `onClick`, nothing time-based or automatic. Isolated repro attempts (navigate → screenshot alone, navigate → evaluate alone, navigate → 3s idle wait) were all clean immediately after navigation. The most likely explanation is that the dev server was being used concurrently in the same browser tab (the previous round's message pointed the user at `localhost:5173` to "poke at it") — i.e., real, separate interaction, not the app changing its own state. Flagged rather than silently dismissed, but not treated as a defect.

## Issues found

1. **(Fixed) `/devices` response-shape mismatch** — see Results. `src/api/devices.ts`.
2. **(Fixed) Docker Desktop bind-mount failure** — see Results. `docker-compose.yml`.
3. No other defects found this round.

## Blockers / unable to validate

- **Write flows not yet exercised**: this round validated read paths (Overview list, Light/Relays/Water tab rendering) against live data, but did not click through create/update/delete actions (registering a device, saving a light schedule, toggling a relay, creating a water schedule, acknowledging an alert) — the previous rounds already validated the *code* against the real request/response schemas, and the read-side checks here confirm the data flowing in is shaped as expected, but the write side has not been exercised end-to-end by this session.
- **Firebase project + VAPID key** — still not supplied; PWA/push registration remains unbuilt and unvalidatable.
- **No automated accessibility audit tool was run** (e.g. axe) — checks remain manual/structural.
- **The live-tail-then-reconnect transition** (socket recovers after a real drop, not just "starts connected") has still not been observed directly — this round only observed "connects successfully from cold start," not a mid-session drop-and-recover, since no interruption was introduced.
