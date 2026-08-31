# TankCtl Dashboard — Frontend Implementation Spec

## Scope and assumptions

**Scope**: a new single-page web app (`tankctl-web/`) that is the primary interface for TankCtl — a holistic overview of every water-tank device the backend tracks, plus drill-down management per tank (lighting, relays, water-change tracking) and system-wide alerts/settings. This spec covers the full v1 feature set agreed for this build: Overview, Tank Detail (Light / Relays / Water / Commands tabs), Alerts, Settings, and the supporting real-time/data layer.

**Assumptions** (confirmed during interview/shape, not to be re-litigated without the user):
- **No authentication in v1.** The app assumes LAN-only reachability as its trust boundary. There is no login screen, no token storage, no per-user concept.
- **Single household, flat device list.** No multi-tenant, no device grouping/hierarchy, no roles.
- **Backend is authoritative and already correct.** The FastAPI + MQTT device-shadow backend enforces fail-safe behavior independently of this UI (see companion "Vol. 1 — Control Architecture" doc). This frontend is a convenience/visibility layer, not a safety layer.
- **Backend water-schedule extension is already implemented** (as of this session): `water_schedules` now supports `schedule_type` of `weekly | custom | interval`, plus `interval_days`, `ph`, `ammonia`, `nitrite`, `nitrate`, `tds` (all nullable). The frontend can build directly against this — no backend blocker remains for the water-tracking feature.
- **No real device/telemetry data was available during spec authoring.** All screens must be designed and validated against clearly-synthetic placeholder data; nothing here should be read as a claim about real tank readings.
- **Deployment**: a new `web` nginx container in `docker-compose.yml`, reverse-proxying REST/WS calls to the existing backend container. This spec does not re-derive that decision; see Open Questions for what's still unspecified about it.
- **Visual world**: standard, restrained dashboard register (Linear/Vercel craft bar), explicitly *not* the "editorial/zine" alternative surfaced during design exploration and *not* a home-lab/Grafana-style monitoring aesthetic.

## Pages and routes

| Route | Page | Purpose |
|---|---|---|
| `/` | Overview | Every tank as a card: name, status, mini sparkline, quick light toggle, alert badge. Searchable/filterable/sortable (designed for 20+ tanks). |
| `/tanks/:deviceId` | Tank Detail | Full stat tiles + temp/humidity charts (Live/7d/30d) plus four tabs (see below). Deep-linkable to a specific tab via query param, e.g. `/tanks/:deviceId?tab=water`. |
| `/tanks/:deviceId` (tab=light) | Light tab | Light schedule editor + manual on/off override. |
| `/tanks/:deviceId` (tab=relays) | Relays tab | Every configured relay for this device (generic — not just light), on/off + rename. |
| `/tanks/:deviceId` (tab=water) | Water tab | Water-schedule list (weekly/custom/interval), "log a change now" flow, complete-with-params flow, calendar/history view. |
| `/tanks/:deviceId` (tab=commands) | Commands tab | Command history/audit log (sent/executed/failed) for this device. |
| `/alerts` | Alerts | Chronological feed from `/events`, filterable by device/type, with acknowledge action. |
| `/settings` | Settings | Register a new device (shows `device_secret` once), list existing devices, bootstrap relay config for a device. |
| `*` (404) | Not Found | Simple "tank not found" state with a link back to Overview. Required because device IDs are user-typable/bookmarkable URLs. |

Routing uses React Router. Tabs are modeled as a `?tab=` search param (not nested routes) so the back button and refresh both preserve the active tab without extra route definitions.

## Components

Shared/reusable (all in the Restrained/Inter visual language — no per-component reinvention):

| Component | Used by | Notes |
|---|---|---|
| `AppShell` | all pages | Left sidebar nav (Overview/Alerts/Settings) that collapses to a top bar on mobile. |
| `StatusPill` | Overview cards, Tank Detail header | Online (green) / Offline (red) / Stale-reconnecting (amber). Text label always accompanies color — never color-only. |
| `StatTile` | Tank Detail | Label + big value + unit + delta-vs-1h-ago. Used for temp, humidity, photoperiod. |
| `LineChart` (SVG, hand-rolled) | Tank Detail | One shape for every metric (temp, humidity). Live/7d/30d aware; renders a visible "stale" end-marker when the feed degrades. No charting library. |
| `TankCard` | Overview | Name, status pill, mini sparkline (uses `LineChart` in a compact mode), quick light toggle, alert-count badge. Click → Tank Detail. |
| `SearchFilterBar` | Overview | Text search + status filter + sort control (name / status / last-updated). Required at 20+ tank scale. |
| `Tabs` | Tank Detail | Light / Relays / Water / Commands. |
| `ScheduleForm` | Light tab, Water tab | Shared shape for "when does this run" — cadence selector (weekly days-of-week / custom date / interval-days), time picker, notes, enable toggle. Water tab's instance adds the completion + water-quality fields; Light tab's instance does not.
| `RelayRow` | Relays tab | Relay name, on/off toggle, rename affordance. |
| `WaterHistoryCalendar` | Water tab | Month-grid calendar marking completed water-change dates; clicking a marked date shows that entry's notes + recorded parameters. |
| `CommandLogTable` | Commands tab | Timestamp, command type, status (sent/executed/failed), raw payload (collapsed by default). |
| `AlertRow` | Alerts page | Timestamp, device, event type, severity, ack button/state. |
| `Toast` | global | Inline, non-blocking feedback for actions (light toggled, schedule saved, water change logged). Replaces modal confirmations for low-risk actions. |
| `EmptyState` | Overview, Water tab, Alerts | "No tanks registered yet" / "No water changes logged yet" / "No alerts" — each with the relevant primary action (Register a device / Log a change / — ). |
| `DeviceRegistrationForm` | Settings | Device name/location + generated secret display (shown once, copy-to-clipboard). |

## User flows

1. **Glance at fleet health** — Land on `/`. See every tank's status pill and mini sparkline without further action. A tank in `offline` or `stale` state is visually distinguishable at a glance (not just on hover/click).
2. **Drill into one tank** — Click a `TankCard` → `/tanks/:deviceId`. See full stat tiles and charts immediately (default tab = whichever tab the user was last on for *any* tank this session, else Light).
3. **Toggle light manually** — From Overview (quick toggle on the card) or from the Light tab. Action is one click, optimistic UI update, confirmed/rolled back via the WS `light_state_changed` event or the REST response.
4. **Edit a light schedule** — Light tab → edit schedule (on/off times) → save. Validation happens client-side before submit (matches backend's Pydantic constraints).
5. **Manage relays** — Relays tab → toggle any listed relay on/off; rename in place. No schedule concept for generic relays in v1 (only light has scheduling).
6. **Configure a recurring water-change schedule** — Water tab → "Add schedule" → choose cadence: weekly (pick day(s) + time), custom (pick one date + time), or interval (pick every-N-days + time) → save. Reminders fire server-side per the chosen cadence (already implemented backend-side).
7. **Log a water change happening right now** — Water tab → "Log now" → creates a one-off custom-dated entry pre-filled with today's date/time → user optionally fills pH/ammonia/nitrite/nitrate/TDS and notes → marks it complete in the same action. This is the primary path that builds "history."
8. **Close out a scheduled water change** — From an existing due/overdue schedule entry → "Mark complete" → same optional water-quality fields → saved. Skipping all water-quality fields is a fully valid, un-penalized path (they're optional per interview).
9. **Review water-change history** — Water tab → calendar view → click a marked date → see that entry's recorded notes/parameters.
10. **Handle a live-data outage** — WebSocket disconnects mid-session → status pill flips to "Reconnecting" (amber) within the reconciler's threshold, a stale banner appears on the affected tank's charts, chart end-marker visibly changes state → automatic fallback to 15s polling → on reconnect, banner clears and the pill returns to its correct state without requiring a manual refresh.
11. **Review and acknowledge an alert** — `/alerts` → filter by device/type if needed → click Acknowledge on a warning → row updates in place (optimistic) and is confirmed via the `attention_dismissed` event.
12. **Register a new device** — Settings → "Register device" → fill form → submit → `device_secret` displayed once with a clear "copy this now, it will not be shown again" warning → device appears in Overview's list going forward.

## State management

- **Server state**: TanStack Query owns every REST-backed value (device list, device detail, schedules, relays, telemetry, events, commands). Query keys are scoped per device (`['device', deviceId]`, `['device', deviceId, 'water-schedules']`, etc.) so a mutation on one tank never invalidates another's cache.
- **Real-time state**: one shared WebSocket connection to `/ws`, established once at app root (not per-page), exposed via a small custom hook (`useLiveEvents`) that other components subscribe to by event type. On receipt of a relevant event (`telemetry_received`, `relay_state_changed`, `light_state_changed`, `device_warning`, `attention_dismissed`, `device_online`/`device_offline`), the hook triggers a targeted TanStack Query cache update (or invalidation) rather than maintaining a second parallel store — the query cache stays the single source of truth for what's rendered.
- **Connection/staleness state**: tracked per-connection (not per-tank) via the WS hook: `connected | reconnecting | polling-fallback`. Each Tank Detail page reads this plus its own `last_seen` timestamp to decide whether to render its stale banner — staleness is derived, not separately fetched.
- **UI-only state** (never persisted to a server): selected chart range (`live | 7d | 30d`), active detail tab, search/filter/sort on Overview, form-in-progress values. Range and tab live in the URL (query params) so they survive refresh and are shareable; search/filter/sort live in local component state (not URL) since they're a transient viewing aid, not a navigable destination.
- **No Redux/Zustand/other global store.** If a cross-cutting client-only value is ever needed beyond the above, it goes in React Context — scope stays intentionally small per the "no global state library" decision.

## API/data requirements

All endpoints below already exist and are ground-truthed against the current backend (`f:\tankctl\src\api\routes\`); none of this requires new backend work beyond the water-schedule extension already shipped this session.

| Need | Endpoint(s) |
|---|---|
| Tank list (Overview) | `GET /devices` |
| Tank detail | `GET /devices/{id}/detail` |
| Device metadata edit | `PATCH /devices/{id}`, `PUT /devices/{id}/metadata` |
| Register device | `POST /devices` |
| Light schedule | `GET / POST / DELETE /devices/{id}/schedule` |
| Manual light on/off | `POST /devices/{id}/light` |
| Pump command | `POST /devices/{id}/pump` |
| Reboot / status refresh | `POST /devices/{id}/reboot`, `POST /devices/{id}/request-status` |
| Command history | `GET /devices/{id}/commands` |
| Relay list/config | `GET / POST /devices/{id}/relays`, `PATCH / DELETE /devices/{id}/relays/{relay_name}` |
| Push relay config to device | `POST /devices/{id}/relays/push-config` |
| Water schedules (list/CRUD) | `GET / POST /devices/{id}/water-schedules`, `PUT / DELETE /devices/{id}/water-schedules/{schedule_id}` — request/response now carry `schedule_type: weekly\|custom\|interval`, `interval_days`, `completed`, `ph`, `ammonia`, `nitrite`, `nitrate`, `tds`. |
| Raw telemetry (live view, last ~1h) | `GET /devices/{id}/telemetry` |
| Per-metric telemetry | `GET /devices/{id}/telemetry/{metric}` |
| Hourly rollup (7d/30d views) | `GET /devices/{id}/telemetry/hourly/summary` |
| Alerts/warnings feed | `GET /events`, `GET /events/devices/{id}`, `GET /events/types` |
| Acknowledge alert | `POST /events/dismissals` |
| Push-token registration | `POST / GET / DELETE /mobile/push-token` (blocked on a Firebase project — see Open Questions) |
| Real-time push | `GET /ws` (single firehose socket) |

**WS event types consumed**: `device_online`, `device_offline`, `telemetry_received`, `relay_state_changed`, `light_state_changed`, `device_warning`, `attention_dismissed`, `shadow_synchronized`, `shadow_drifted`. The client filters a single event stream by the `event` field — there is no per-topic subscription API to call.

**Telemetry resolution strategy**: three feeds into one chart buffer — hourly rollup for 7d/30d, raw telemetry for the live view's first hour on mount, WS `telemetry_received` appended continuously thereafter. On WS disconnect, fall back to polling `GET /telemetry` every 15s; the chart must never silently stop updating without a visible indicator.

## Styling/design system

- **Color strategy**: Restrained — neutral gray/white ground (near-black in dark mode), one accent color (teal/cyan, water-adjacent, used sparingly for primary actions and active states) — plus a separate semantic layer strictly for status: green = online/safe, amber = warning/stale/reconnecting, red = offline/danger. Status color is never the sole signal; every status pill/badge pairs color with a text label or icon.
- **Typography**: Inter (or the system-ui stack as fallback) for all UI text; a tabular-figure monospace face for telemetry numbers, timestamps, and command-log entries specifically (so columns of numbers align). No display/editorial typeface — this is an Operate-mode surface.
- **Craft bar**: Linear + Vercel dashboard register — crisp neutrals, high production value, restrained accent use. Explicitly not Grafana/Home-Assistant-style dense monitoring chrome, and not the editorial/zine alternative that was considered and declined during shape.
- **Theming**: light mode default; dark mode supported (not optional — status colors and chart series need distinct light/dark values, which must be designed together, not patched in later).
- **Layout**: left sidebar nav (Overview/Alerts/Settings) at desktop widths, collapsing to a top bar below the mobile breakpoint. Overview is a responsive card grid (not a fixed column count) built to remain usable at 20+ tanks — meaning the search/filter/sort bar is not optional polish, it's load-bearing at that scale.
- **Components**: no third-party component library, no Storybook. Charts are hand-rolled inline SVG (one shape, reused for every metric) — no charting library dependency.
- **Motion**: minimal and purposeful — status-pill/banner transitions when connection state changes, optimistic-action feedback (toast slide-in), no decorative animation. Respects `prefers-reduced-motion`.

## Accessibility requirements

- Semantic HTML throughout: real `<button>`/`<nav>`/`<table>`/`<form>` elements, not divs with click handlers, so screen readers and keyboard users get correct roles for free.
- Full keyboard operability: every action reachable via Overview/Tank Detail/Alerts/Settings (toggle light, toggle relay, open a tank, switch tabs, acknowledge an alert, submit a schedule form) must be doable without a mouse, with a visible focus indicator at every step.
- Color is never the only signal: status (online/offline/stale, alert severity) is always paired with a text label or icon, not conveyed by hue alone — required given the Restrained + semantic-status palette above.
- Sufficient contrast: body text and status-pill text meet WCAG AA contrast against their background in both light and dark mode.
- Charts have a non-visual fallback: each `LineChart` instance is paired with an actual data table (or an equivalent accessible summary) that a screen-reader user or non-visual user can consult instead of reading the SVG.
- Form fields (schedule forms, device registration, water-quality readings) carry proper `<label>` associations and inline validation messages announced to assistive tech (e.g. `aria-live` on error text), not color-only error states.
- No specific additional accessibility requirement was named by the user beyond the above baseline (see PRODUCT.md `Accessibility & Inclusion`) — this is "good practice," not a bespoke requirement, and should not be gold-plated beyond it without a reason.

## Acceptance criteria

- [ ] Overview renders every device from `GET /devices` as a card with status, sparkline, quick light toggle, and alert badge; renders a populated empty state when the list is empty.
- [ ] Overview's search/filter/sort works correctly against a 20+ device dataset (verified with placeholder data at that scale, not just 2–3 sample tanks).
- [ ] Clicking a tank card navigates to `/tanks/:deviceId` and loads that tank's detail without a full page reload.
- [ ] Tank Detail shows live stat tiles + a temp chart + a humidity chart, each correctly switching data source when the Live/7d/30d range control is used.
- [ ] Killing the WebSocket connection (simulated) causes, within the reconciler's threshold: the status pill to show "Reconnecting," a visible stale banner on the affected charts, the chart's end-marker to change appearance, and polling fallback to begin — with no chart silently freezing without any of the above.
- [ ] Reconnecting the WebSocket clears the stale banner and restores the "Online" status without requiring a manual page refresh.
- [ ] Light tab: manual on/off toggle round-trips through the API and reflects via the WS event or the REST response within a user-perceptible instant (optimistic UI, then confirmed).
- [ ] Light tab: schedule create/edit/delete round-trips correctly and matches the backend's validation rules (e.g. weekly requires at least one day-of-week).
- [ ] Relays tab: every relay returned by `GET /devices/{id}/relays` is listed, independently toggleable, and renameable.
- [ ] Water tab: all three cadence types (weekly/custom/interval) can be created, edited, and deleted; the interval type correctly requires and stores `interval_days`.
- [ ] Water tab: "Log now" and "Mark complete" flows both support optionally entering pH/ammonia/nitrite/nitrate/TDS and both succeed with all of those fields left blank.
- [ ] Water tab: the calendar view correctly marks every schedule entry with `completed = true` on its `schedule_date`, and clicking a marked date shows its notes/parameters.
- [ ] Commands tab lists this device's command history with correct status (sent/executed/failed) per entry.
- [ ] Alerts page lists events from `GET /events`, supports filtering by device/type, and acknowledging an alert updates its state without a full page reload.
- [ ] Settings: registering a device succeeds, displays the returned `device_secret` exactly once, and the new device subsequently appears on Overview.
- [ ] Every interactive control in every screen above is operable by keyboard alone, with a visible focus state.
- [ ] The app is usable (not just "renders") at a mobile viewport width — sidebar collapses to a top bar, card grid reflows, no horizontal scroll on any page.
- [ ] Dark mode renders all status colors, chart series, and text with correct contrast — not just an inverted background.

## Open questions / unknowns

These are genuine gaps this spec cannot resolve on its own — they need either a user decision or an external input before the corresponding piece can be built or validated:

- **No running frontend exists yet to validate against.** This spec is being authored before `tankctl-web/` is scaffolded (per the plan, backend was built first). The Playwright validation pass (`02_validation.md`) that follows this document has nothing live to exercise — see that file's Blockers section.
- **Exact accent color and full palette values** are specified as a strategy ("Restrained, one teal/cyan accent, semantic status colors") but not as final hex/token values — those get fixed when the visual system is actually built/documented (DESIGN.md), not in this spec.
- **Firebase project + VAPID key** for web push are required before push-notification registration (`POST /mobile/push-token`) can be wired up client-side. Not supplied yet; PWA/push work is blocked on this input specifically, independent of everything else in this spec.
- **PWA icon/asset set** (app icons at required sizes, splash screens) has not been produced or supplied. Needed before the PWA manifest can be finalized.
- **Default landing tab on Tank Detail** is specified above as "last tab used this session, else Light" — this is a reasonable default chosen for this spec, not something the user was explicitly asked to confirm; flag for a quick sign-off before or during build.
- **Command history retention/pagination** — the spec assumes `GET /devices/{id}/commands` can be paged or reasonably limited, but no explicit page size or retention policy was discussed. Needs a decision once the endpoint's actual result-set size in practice is known.
- **Nginx reverse-proxy specifics** (exact path rewrites, WS proxy config, TLS-or-not on the LAN) were decided at the level of "new nginx container, reverse-proxy to backend" but not specified route-by-route. This is an infrastructure detail to resolve during the deployment step, not a frontend-code blocker.
- **No real device data reviewed.** Every number, tank name, and chart shape used in mockups/prototypes must be clearly synthetic; there is no reference dataset to validate "does this look right for actual tank readings" against.
