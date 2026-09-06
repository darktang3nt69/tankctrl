# shadcn/ui migration — design spec

Date: 2026-08-30
Scope: `tankctl-web/` (entire frontend)

## Why

Current UI is hand-rolled plain CSS (`src/styles/*.css`, one CSS file per
component). User wants to switch the whole app to
[shadcn/ui](https://ui.shadcn.com) (Tailwind v4 + Radix primitives).

This **reverses** an explicit prior decision in
[`docs/ui/01_spec.md:114`](../../ui/01_spec.md#L114): *"no third-party
component library, no Storybook."* That line is being changed as part of
this migration (see "Spec doc updates" below), not silently ignored.

It also **fixes** a standing deviation from
[`docs/ui/01_spec.md:112`](../../ui/01_spec.md#L112): the spec calls for
*"light mode default; dark mode supported"* but `tokens.css` has been
dark-only since it was written. This migration adds real light mode.

## Decisions

Captured from brainstorming Q&A — recorded here so the implementation plan
doesn't have to re-litigate them:

1. **Big-bang migration.** Ships as one migration effort, not staged
   incrementally behind coexisting old/new CSS. (Still has an internal build
   order for implementation purposes — see "Build order" — but the app
   isn't released mid-migration.)
2. **Standard shadcn CLI flow**, driven by the official MCP server
   (`shadcn mcp init` → writes `.mcp.json` for Claude Code) for accurate,
   current component APIs instead of relying on training-data memory.
3. **Forms use react-hook-form + zod** (shadcn's actual `Form` pattern),
   not a reskin of hand-rolled `useState` forms.
4. **Water calendar rebuild folds into this migration.** The
   logged-vs-scheduled marker feature (from the earlier, separately-approved
   calendar design) is built directly on shadcn's `Calendar`
   (react-day-picker) rather than fixed once in old CSS and redone later.
5. **Add real light mode**, not just dark. shadcn's CSS-variable theming
   plus `next-themes` makes this cheap while every component is being
   rebuilt anyway.
6. **Testing = rigorous manual QA pass**, not new automated test
   infrastructure. No frontend test framework exists in this repo today;
   adding one is a second new subsystem stacked on an already-large
   migration. Manual verification matches CLAUDE.md's existing rule for UI
   changes (verify in the browser, not just type-check).
7. **Overview sparkline goes WS-live**, not just visually polished on top
   of the existing 60s poll — reuses the live-tail pattern Tank Detail's
   `'live'` chart range already established, rather than inventing a
   second telemetry-freshness mechanism.
8. **Sparkline gets a marker dot on every point**, not just on the latest
   (pulsing) point.

## Architecture

- `shadcn init` (Vite preset) adds:
  - Tailwind v4 via `@tailwindcss/vite` (Vite plugin, no separate
    `tailwind.config.js` — Tailwind v4 is CSS-first via `@theme`).
  - `components.json` (style: `new-york`, base color mapped to the
    project's existing neutral/amber palette, not a stock shadcn color).
  - `src/lib/utils.ts` — `cn()` (clsx + tailwind-merge).
- **Token mapping**: `src/styles/tokens.css` values move into shadcn's
  expected CSS variable names (`--background`, `--foreground`, `--card`,
  `--primary`, `--primary-foreground`, `--muted`, `--muted-foreground`,
  `--border`, `--destructive`, `--ring`, etc), defined once in `:root`
  (new light values, authored to match 01_spec.md's "Linear/Vercel
  craft-bar" register — crisp neutrals, restrained accent) and once under
  `.dark` (current amber-on-near-black values ported ~1:1 from the
  existing `tokens.css`).
  - Tokens with no shadcn equivalent — `--safe`, `--warn`, `--series-temp`,
    `--series-humid`, the `.hud-frame` corner-bracket motif — are kept as
    additional CSS variables alongside shadcn's set, in both light and
    dark blocks.
- **Theme toggle**: `next-themes`, default to system preference, toggle
  added to `AppShell`. Avoids flash-of-wrong-theme on load.
- No changes needed to `react-router-dom`, `@tanstack/react-query`,
  `motion`, or `lucide-react` — all orthogonal to the UI-primitive swap and
  already compatible (shadcn also uses `lucide-react` by default).

## Component mapping

| Current | Becomes |
|---|---|
| `.btn` / `.btn--primary` / `.btn--danger` / `.btn--ghost` (`ui.css`) | shadcn `Button` (`default` / `destructive` / `ghost` variants) |
| `.card` (`ui.css`) | shadcn `Card` |
| `.field` + raw `<input>`/`<select>`/`<textarea>` (`ui.css`, `WaterScheduleForm.tsx`, and other forms) | shadcn `Form`/`FormField`/`FormItem`/`FormMessage` (react-hook-form + zod) wrapping `Input`/`Select`/`Textarea` |
| `Tabs.tsx` (custom + `motion` underline) | shadcn `Tabs` (Radix-based). Hand-rolled underline animation dropped — Radix's built-in active-state styling replaces it. |
| `Toast.tsx` (custom context + `motion`) | `sonner`. `ToastProvider`/`useToast` removed; call sites (`WaterTab`, `Alerts`, others) updated to call `toast()` from `sonner` directly — no compatibility shim, since this is a big-bang rewrite anyway. |
| `StatusPill.tsx` | shadcn `Badge`, existing status→color logic kept, re-expressed as Badge variants |
| `.data-table` (`ui.css`) | shadcn `Table` |
| `WaterHistoryCalendar.tsx` | shadcn `Calendar` (react-day-picker) with a custom day-cell renderer (`components`/`DayButton` override) carrying the logged/scheduled marker logic (see "Water calendar" below) |
| `EmptyState`, `StatTile`, `SearchFilterBar` | **Stay hand-rolled.** 01_spec.md's hand-rolled-SVG-chart rule is unaffected by this migration — only reskinned with Tailwind utilities + shadcn tokens instead of scoped CSS files. |
| `LineChart`, `Sparkline` | Stay hand-rolled (same rule), reskinned — plus gain tooltips and (`Sparkline`) live data + point markers, see "Graph tooltips" and "Live sparkline" below. |

All per-component CSS files (`AppShell.css`, `EmptyState.css`,
`LineChart.css`, `SearchFilterBar.css`, `StatTile.css`, `StatusPill.css`,
`Tabs.css`, `TankCard.css`, `Toast.css`, `Alerts.css`, `Overview.css`,
`Settings.css`, `TankDetail.css`, `WaterHistoryCalendar.css`,
`tab-panels.css`, `ui.css`) are deleted once nothing references them.
`tokens.css` is kept but rewritten to shadcn's variable convention.

## New dependencies

`tailwindcss` (v4), `@tailwindcss/vite`, `class-variance-authority`,
`clsx`, `tailwind-merge`, Radix UI primitives (installed per-component by
the shadcn CLI as needed), `react-hook-form`, `zod`, `@hookform/resolvers`,
`next-themes`, `sonner`.

## Water calendar (folds in the earlier calendar design)

Rebuilt on shadcn's `Calendar`, keeping the data/marker logic from the
previously-approved (pre-shadcn) design rather than the grid markup:

- `completedByDate` map (existing): completed `custom` entries.
- `scheduledByDate` map (new): `enabled && !completed` schedules —
  `custom` → exact date; `weekly` → any date in the visible month whose
  weekday is in `days_of_week`; `interval` → projected forward from
  `created_at` every `interval_days`.
- Day-cell renderer shows a "logged" marker (existing accent) and/or a
  "scheduled" marker (secondary color) per date; both can appear on the
  same date. Legend row: ● logged, ○ scheduled.
- Selecting a logged date shows readings (pH/ammonia/nitrite/nitrate/TDS)
  as today. Selecting a scheduled-only date shows cadence + time (reusing
  `WaterTab.tsx`'s `cadenceLabel` logic).

## Alerts — human-friendly event types

`Alerts.tsx` currently renders the raw backend event string
(`e.event`) directly as the row title. Backend event types
(`src/domain/event.py`, `src/services/shadow_service.py`,
`src/infrastructure/mqtt/handlers.py`) are a closed set of 8:

| Raw | Label |
|---|---|
| `device_registered` | Device registered |
| `device_online` | Came online |
| `device_offline` | Went offline |
| `command_sent` | Command sent |
| `command_executed` | Command executed |
| `command_failed` | Command failed |
| `light_state_changed` | Light schedule changed |
| `device_warning` | Warning |

A local `EVENT_LABELS: Record<string, string>` map in `Alerts.tsx` (or a
new `src/lib/eventLabels.ts` if reused elsewhere) replaces the raw string
in the row title and in the type-filter `<select>`/shadcn `Select` options.
Unknown/future event types fall back to the raw string so this never hard-
fails on a backend addition. `device_warning` rows additionally surface
`meta.code` (already read for the acknowledge action) as a sub-label where
present, since "Warning" alone isn't specific enough.

## Graph tooltips

`LineChart` already tracks `hoverIdx` and renders a text readout below the
chart, but no floating tooltip follows the cursor. Add one using the new
shadcn `Tooltip` primitive (Radix-based — added to the Build order's
primitive-generation step): shown while hovering the plot area, positioned
at the hovered point, content = formatted time + value + unit (same data
already backing the below-chart readout, which stays as-is for
keyboard/non-hover accessibility — the tooltip is additive, not a
replacement). Sparkline dots (see below) get the same `Tooltip` primitive
on hover, showing just the value (no time axis on a sparkline).

## Live sparkline (TankCard / Overview)

Today `Sparkline` is decorative-only (`aria-hidden`, no dots, no hover) and
`TankCard` feeds it from `useSparkline`, a 60s-polled query. This adds:

- **Live data**: a new `useLiveSparkline(deviceId)` hook mirroring the
  live-tail pattern `useTankTelemetry.ts` already uses for Tank Detail's
  `'live'` chart range — seed from the existing `useSparkline` query
  (last 12 points), then append via
  `useLiveEvent(['telemetry_received'], ...)` filtered to that device,
  ring-buffered to the sparkline's point cap (matches current `limit=12`)
  so an open Overview page doesn't grow memory per card. When
  `useLiveConnectionStatus()` reports `'polling-fallback'`, the existing
  60s `refetchInterval` on `useSparkline` already covers the fallback —
  no new polling logic needed.
  - Scale note: Overview can hold 20+ cards (per 01_spec.md's scale
    requirement); each mounts one filtered `useLiveEvent` listener off the
    single shared WebSocket connection — cheap (one socket, N handlers),
    the same fan-out pattern `useGlobalLiveSync.ts` already uses.
- **Visual**: a small dot marker at every point (not a bare polyline), plus
  a pulsing marker at the latest point — CSS/SVG animation, reusing the
  series color prop, respecting `prefers-reduced-motion` per the existing
  motion rule (01_spec.md).
- **Tooltip**: hovering a dot shows its value via the shadcn `Tooltip`
  primitive (see "Graph tooltips" above).

## Build order

Internal staging only — this ships as one migration, not a series of
separately-released increments:

1. Foundation: Tailwind + shadcn init, token/theme mapping, `next-themes`.
   App still compiles with old CSS files present but unused by new code.
2. Generate primitives via `shadcn add`: button, card, tabs, dialog, badge,
   input, select, textarea, form, calendar, table, sonner, tooltip.
3. Rewrite shared components: `AppShell`, `Tabs`, `Toast`→sonner,
   `StatusPill`→`Badge`, `EmptyState`, `StatTile`, `LineChart` (+ tooltip),
   `Sparkline` (+ live data, point markers, pulsing latest dot, tooltip).
4. Rewrite routes: `Overview`, `Alerts` (incl. event-label map), `Settings`,
   `TankDetail`.
5. Rewrite tank-detail tabs/forms: `CommandsTab`, `LightTab`, `RelaysTab`,
   `WaterTab`, `WaterScheduleForm` (react-hook-form+zod), and
   `WaterHistoryCalendar` (shadcn `Calendar` rebuild).
6. Delete now-unused per-component CSS files.
7. Update `docs/ui/01_spec.md`: record the component-library reversal
   (line 114) and the light-mode addition (line 112 now accurate again).

## Verification — manual QA pass

No frontend test framework exists in this repo; per CLAUDE.md's rule for
UI changes, verification is a dev-server walkthrough, not a claimed pass:

- Every route (Overview, Alerts, Settings, Tank Detail) loads and its data
  renders.
- Every tank-detail tab (Commands, Light, Relays, Water) — every
  create/edit/delete action, every form validation error path (via zod).
- Water calendar: logged markers, scheduled markers (weekly/interval/
  custom), combined-marker dates, detail panel for both marker types,
  month navigation.
- Alerts: event-type labels render correctly for all 8 known types, filter
  dropdown shows labels not raw strings, acknowledge action still works,
  an unrecognized event type falls back to the raw string without erroring.
- Toast notifications (success and error paths) fire correctly via sonner.
- LineChart tooltip appears on hover, follows the cursor, matches the
  below-chart readout's value; keyboard/no-hover path (the readout row)
  still works.
- Overview cards: sparkline shows a dot per point, latest dot pulses,
  hovering a dot shows its tooltip, and a live `telemetry_received` event
  actually moves the line (not just the 60s poll) — confirm by watching a
  card update without waiting a minute. `polling-fallback` state (e.g. by
  blocking the WS in devtools) still updates the sparkline within 60s.
- Theme toggle: light and dark both readable, no flash-of-wrong-theme on
  reload, `prefers-reduced-motion` still respected.
- **Spacing/alignment audit**: visually check padding/gap consistency
  between shadcn's default spacing scale and the rest of the app at each
  screen — card padding, form field spacing, button groups, table
  row height — across both themes and at mobile/desktop breakpoints (per
  01_spec.md's responsive layout requirement).
- Findings from this pass get fixed before the migration is considered
  done, not filed as follow-ups.

## Open risks

- Radix `Tabs`/`Dialog`/`Select` behavior (focus trapping, keyboard nav)
  differs from the current hand-rolled `Tabs.tsx` — expected to be a
  strict accessibility improvement, but worth confirming nothing currently
  relied on the old component's specific quirks.
- `next-themes` + Vite (not Next.js) needs the manual SSR-less setup
  variant — no SSR in this app so this is simpler than the Next.js docs
  path, just needs to not be copy-pasted from Next-specific examples.
