# TankCtl Web — Visual & Interaction Redesign Plan

Target branch: `worktree-shadcn-migration` (this worktree), **not** `main`. Free to lean fully into the existing shadcn/ui + Tailwind v4 + Radix stack — no vanilla-CSS constraint. No landing-page patterns (hero sections, marquees, bento grids) — this is a device-control dashboard.

Audited live via the running dev server (`npm run dev`) with Playwright, both light and dark theme, across Overview, Tank Detail (all 4 tabs), Alerts, and Settings. Inspiration pulled from two live references, also via Playwright: the [Home Assistant demo dashboard](https://demo.home-assistant.io/) (entity tiles, state-colored icons, grouped sections, inline mini-charts) and [linear.app](https://linear.app) (activity-feed row pattern, colored status icons, properties panel).

## 1) Goals

- Give the dashboard a distinctive, considered visual identity — it currently reads as a competent but generic admin-panel scaffold, not a finished product.
- Fix the concrete gaps found in this audit: a dead font import, a floating action button that overlaps page content, an undifferentiated alerts feed, and relay-row polish (confirm-delete, hover, badges) that exists on `main` but was never ported here.
- Pull specific, named patterns from Home Assistant (state-colored entity icons, grouped sections, inline sparkline-in-tile) and Linear (icon-led activity rows, colored status dots) rather than inventing from scratch.
- Use the existing shadcn/ui primitives already installed (`button`, `card`, `badge`, `dialog`, `form`, `select`, `table`, `tabs`, `tooltip`, `popover`, `calendar`) instead of hand-rolling new components.
- Preserve what already works: the light/dark theme system (`next-themes`, `.dark` class tokens), the per-user accent-color picker in Settings, the HUD corner-bracket motif on Tank Detail, and all existing functionality.
- Ship no new pages, nav items, or backend-driven features — visual/interaction redesign plus small, justified functional fixes only.

## 2) Audit Findings

**Confirmed via live screenshot, both themes — already solid, do not "fix":**
- Light/dark theme system works cleanly with no section-level inversions; the amber-on-near-black dark palette and the off-white/white light palette both hold together.
- HUD corner brackets on the Tank Detail header are a good, restrained signature motif.
- Settings' per-user accent-color picker (6 swatches) is a real, working personalization feature — not a "AI purple" default to strip out.
- `StatTile` spring-animated numbers and `AppShell` route-transition motion are already present and tasteful.

**Real gaps found:**
- **Dead font import.** `@fontsource-variable/geist` is imported in `index.css:5`, but `tokens.css:42`'s `--font-sans` still lists `'Inter'` first, so Geist is imported and never applied. One-line fix, immediate visual upgrade.
- **Floating "+" button overlaps content.** The global "register tank" FAB (`AppShell.tsx`, opens `RegisterTankModal`) is fixed bottom-right on *every* route, including Settings, where it visibly overlaps the last device row's "Configure relays" button in the audit screenshot. It also appears on Alerts and the Tank Detail tabs, where "register a tank" isn't a relevant action.
- **Alerts feed has zero visual differentiation.** Every row (`Command sent`, `Device registered`, warnings) renders identically — same weight, no icon, no color. Confirmed live: an 11-row feed where nothing draws the eye to what matters.
- **RelaysTab in this worktree lacks the polish shipped on `main` this session**: no toast dismiss button (uses `sonner`, worth confirming it has a close affordance), no two-step confirm-before-delete (Delete relay is a single click, `btn--danger` styled as a soft pink fill), no type badge.
- **Chart empty states are a bare box with "No data yet" text** — functional but not composed; Home Assistant's inline mini-charts suggest a better default (or at least a nicer empty illustration).
- **Schedule time inputs are needlessly full-width** — the Light tab's "On time"/"Off time" fields stretch to the full content width (~1200px) for a `06:00` value, out of proportion to the data.
- **Tank/relay/device state has no color-coded iconography** — every list (Overview cards, Relays, Settings devices) uses plain text status, never a colored icon-badge the way Home Assistant colors an entity icon by on/off state.

## 3) Proposed Functional Changes

- **Fix the font token** so Geist Variable actually renders (see WS-1).
- **Move "register tank" out of a floating overlap-prone FAB** into a header-adjacent icon button (Home Assistant's top-bar `+` pattern) that only renders where it's contextually relevant (Overview header, and optionally a persistent-but-non-overlapping position elsewhere) — eliminates the content-overlap bug outright rather than just pushing z-index around.
- **Port the `main`-branch RelaysTab improvements into this worktree**, rebuilt on shadcn primitives: two-step confirm-before-delete (fade + confirm), `Badge` component for relay type, row hover state, and confirm `sonner` toasts have a dismiss affordance (sonner supports this natively — verify it's enabled, don't hand-roll it).
- **Severity/type-coded Alerts rows**, Linear-style: a small colored status icon per event type (info/command = neutral, `device_registered` = accent, `device_warning` = destructive/warn), plus the existing Acknowledge action kept as-is.
- **State-colored icon badges** on Overview `TankCard` and relay rows — a filled/tinted circular icon background when a device or relay is "on"/"online", muted/grey when off/offline, matching Home Assistant's entity-tile convention. Uses existing status tokens (`--safe`, `--warn`, `--danger`), no new colors.
- **Right-size the schedule time inputs** — cap their width to something proportionate to a time value instead of stretching full-width.

## 4) Proposed UI Changes

- **Typography**: fix the Geist token wiring (functional fix above) — this alone changes the whole app's type feel. Confirm heading weights (600/700 currently) still read well in Geist Variable; adjust only if needed.
- **Overview**: restyle `TankCard` with a Home-Assistant-style icon-led header (colored status icon replacing/augmenting the current status pill), tighter footer with an icon-only light toggle instead of two full-text buttons.
- **Tank Detail**: replace the flat "No data yet" chart placeholder with a composed empty state (icon + short copy, still no fake data); right-size the schedule time inputs; extend RelaysTab's ported polish (badges, hover, confirm-delete) as the reference bar for the Light/Water/Commands tabs.
- **Alerts**: icon-led rows with per-type color, grouped visually the way Linear's activity feed groups by recency/actor rather than a flat undifferentiated list — but keep it simple, this is a log, not a kanban.
- **Settings**: keep the accent-color picker and timezone selector as-is (they're good); apply the same row treatment (hover, consistent padding) to the device list that Alerts/Relays get, for consistency across all three list surfaces.
- **Global chrome**: resolve the FAB overlap (functional change above) — this is as much a UI defect as a functional one.
- **Explicitly out of scope**: no new accent color (the picker already covers personalization), no hero sections, marquees, or bento grids, no light-mode-only or dark-mode-only lock-in (both themes stay supported), no component-library swap away from shadcn/ui (already the right choice here).

## 5) Inspiration and References

- **[demo.home-assistant.io](https://demo.home-assistant.io/)** (screenshotted live during this audit) — grouped entity sections with an inline status-chip header per group, colored circular icon badges that shift color/fill by on/off state, inline mini-sparkline inside a sensor tile, dense-but-breathable tile grid with soft shadows instead of hard borders. Directly informs the TankCard/relay-row icon-badge proposal above.
- **[linear.app](https://linear.app)** (screenshotted live during this audit) — colored status icon + label pattern (e.g. a yellow circle for "In Progress"), icon-led activity-feed rows combining actor + action + relative timestamp, minimal icon-only left nav. Directly informs the Alerts severity-coding proposal above.
- The `main` branch's `RelaysTab.tsx`/`Toast.tsx` (this session's earlier work) — the confirm-delete and dismiss-toast patterns already validated there should be ported, not redesigned from scratch.
- `.agents/skills/redesign-existing-projects/SKILL.md` and `.agents/skills/design-taste-frontend/SKILL.md` — general audit framework; their landing-page-specific rules (hero copy limits, eyebrow caps, marquees) are noted as inapplicable here per the user's explicit "no landing page" direction.

## 6) Implementation Phases

**Phase 0 — Alignment (already resolved this round):** target = this worktree; component-library-freedom confirmed; font = Geist; no landing-page patterns. No further sign-off needed before Phase 1.

**Phase 1 — Foundations (must land and typecheck before Phase 2):** font token fix, FAB relocation, ported RelaysTab polish (this unblocks using it as the reference pattern for Phase 2's other tabs), shared status-icon-badge component.

**Phase 2 — Page-by-page application (parallelizable once Phase 1 merges):** Overview/TankCard icon-badges, Alerts severity coding, Settings device-row consistency pass, Light/Water/Commands tabs brought to the RelaysTab bar, chart empty-state composition, schedule input sizing.

**Phase 3 — Cross-cutting polish:** full click-through of both themes on all routes, icon consistency audit, confirm nothing regressed against the pre-redesign screenshots taken during this audit.

**Phase 4 — Verification:** `npx tsc --noEmit` clean in `tankctl-web/`, manual Playwright click-through of all 7 routes/tabs × 2 themes, screenshot comparison against this plan's audit screenshots.

## 7) Subagent Workstreams

| Workstream | Phase | Files | Task |
|---|---|---|---|
| WS-1: Font Token Fix | 1 (blocks visual review of everything else) | `src/styles/tokens.css` | Set `--font-sans` to `'Geist Variable', ...` fallback chain; verify heading weights still read well |
| WS-2: FAB Relocation | 1 | `src/components/AppShell.tsx`, `src/components/RegisterTankModal.tsx` | Move "register tank" trigger out of the overlapping fixed FAB into a non-overlapping, contextually-scoped placement |
| WS-3: RelaysTab Port | 1 | `src/features/tank-detail/RelaysTab.tsx` (+ any new shared row/badge component) | Port confirm-before-delete, hover state, and relay-type `Badge` from `main`'s `RelaysTab.tsx`, rebuilt on shadcn primitives |
| WS-4: Status Icon Badge | 1 (parallel, new component) | new `src/components/ui/status-icon.tsx` (or similar) | Home-Assistant-style colored circular icon badge, state-driven (on/off/online/offline), reusable across Overview/Relays/Settings |
| WS-5: Overview + TankCard | 2 (depends on WS-2, WS-4) | `src/components/TankCard.tsx`, `src/routes/Overview.tsx` | Icon-badge header, icon-only light toggle |
| WS-6: Alerts Severity Coding | 2 (depends on WS-4) | `src/routes/Alerts.tsx` | Icon-led rows, per-event-type color, Linear-style row composition |
| WS-7: Settings Row Consistency | 2 (depends on WS-3's row pattern) | `src/routes/Settings.tsx` | Apply the same row hover/padding treatment to the device list; keep accent-picker and timezone selector untouched |
| WS-8: Remaining Tank Detail Tabs | 2 (depends on WS-3) | `LightTab.tsx`, `WaterTab.tsx`, `CommandsTab.tsx`, chart empty-state, schedule input width | Bring to the RelaysTab reference bar; compose chart empty state; right-size time inputs |
| WS-9: Verification Pass | 3–4 (runs last) | none (read/test only) | Playwright click-through, both themes, all routes; diff against audit screenshots; `tsc --noEmit` |

Each workstream ends with a passing `npx tsc --noEmit` in `tankctl-web/` and a short note on what it touched.

## 8) Risks and Open Questions

- **WS-2 (FAB) and WS-5 (Overview) both touch where "register tank" lives** — sequence WS-2 before WS-5 starts, not truly parallel.
- **WS-3 is a dependency for WS-7 and WS-8** — the row pattern it establishes should be finalized before those workstreams copy it, or they'll copy a moving target.
- **`sonner`'s dismiss affordance needs a quick check** before assuming it's missing — sonner toasts often have a built-in close button depending on config; verify in `src/components/ui/sonner.tsx` before building a custom one.
- **Icon-badge color mapping needs one consistent source of truth** (WS-4) so Overview, Relays, and Settings don't each invent slightly different state→color rules.
- **No CI/lint gate in this repo** — each workstream is responsible for its own verification.
- **Scope creep guard** — this plan adds no new pages, nav items, or backend-driven features; anything larger than what's listed above should go back through brainstorming before a subagent touches code.
