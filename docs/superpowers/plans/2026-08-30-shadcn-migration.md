# shadcn/ui Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `tankctl-web`'s hand-rolled plain-CSS UI with Tailwind v4 + shadcn/ui across the entire app, in one migration (big-bang), while adding light mode, graph tooltips, a WS-live sparkline, a rebuilt water-history calendar (logged + scheduled markers), and human-friendly alert-type labels.

**Architecture:** `shadcn init` (Vite preset) adds Tailwind v4 + `components.json` + `src/lib/utils.ts`. shadcn primitives are generated once into `src/components/ui/`. Every existing component/route is then rewritten against those primitives, working outward from shared components to routes to tank-detail tabs/forms. `tokens.css` is remapped to shadcn's CSS-variable convention (light + dark blocks) so the existing amber/dark brand survives. Forms move from hand-rolled `useState` to `react-hook-form` + `zod` via shadcn's `Form`. No automated frontend tests exist in this repo — every task's verification step is a dev-server check, per CLAUDE.md's rule for UI changes.

**Tech Stack:** React 19, Vite, TypeScript, Tailwind v4 (`@tailwindcss/vite`), shadcn/ui (Radix primitives), react-hook-form + zod, next-themes, sonner, `@tanstack/react-query`, `react-router-dom`, `motion`, `lucide-react`.

**Spec:** `docs/superpowers/specs/2026-08-30-shadcn-migration-design.md`

## Global Constraints

- **No new test framework.** Every task's verification is `npm run dev` + a browser check, not a unit test — per the spec's Testing decision. There is no `pytest`-equivalent for this frontend.
- **Button variant mapping** (used throughout — decided once here, not re-derived per task): existing `.btn` → shadcn `Button` `variant="outline"`; `.btn--primary` → `variant="default"`; `.btn--danger` → `variant="destructive"`; `.btn--ghost` → `variant="ghost"`.
- **Path alias**: `@/*` → `./src/*` (added in Task 1). All new/rewritten files import shadcn primitives as `@/components/ui/<name>` and the class helper as `@/lib/utils`. Existing app code keeps its current relative-import style — do not mass-convert unrelated imports to `@/`.
- **Toast**: `sonner`'s `toast()` / `toast.error()` replaces `useToast()`/`ToastProvider` everywhere (removed in Task 10). Every file that currently calls `useToast()` gets its calls converted as part of that same file's own task, not as one big cross-file sweep.
- **Motion**: keep respecting `prefers-reduced-motion` (existing app-wide rule, `index.css`) — any new CSS/Tailwind animation (the sparkline's pulsing dot) must have a `motion-reduce:` override, since Tailwind's `animate-pulse` does not disable itself automatically.
- **shadcn CLI config** (set in Task 2): style `new-york`, base color `neutral`, CSS variables enabled, no default color preset kept — Task 3 overwrites the generated tokens with the project's own amber/neutral palette.
- **Every task deletes what it makes obsolete in the same commit** (the old scoped `.css` file's *contents* it replaces stay imported until Task 24, which does the final `rm` + import cleanup pass — don't delete a CSS file that's still imported by an unmigrated sibling).

---

### Task 1: Tailwind v4 + path alias setup

**Files:**
- Modify: `tankctl-web/package.json` (deps)
- Modify: `tankctl-web/vite.config.ts`
- Modify: `tankctl-web/tsconfig.json`
- Modify: `tankctl-web/tsconfig.app.json`
- Modify: `tankctl-web/src/index.css`

**Interfaces:**
- Produces: `@` import alias resolving to `tankctl-web/src`, and `@import "tailwindcss";` active in the global stylesheet. Every later task depends on both.

- [ ] **Step 1: Install Tailwind v4 and the Vite plugin**

```bash
cd tankctl-web
npm install tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Add the Tailwind plugin and `@` alias to Vite config**

`tankctl-web/vite.config.ts`:

```ts
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 3: Add the path alias to both tsconfig files**

`tankctl-web/tsconfig.json` — add a `compilerOptions` block (it currently only has `files`/`references`):

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ],
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

`tankctl-web/tsconfig.app.json` — add `baseUrl`/`paths` inside the existing `compilerOptions`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "DOM"],
    "module": "esnext",
    "types": ["vite/client"],
    "allowArbitraryExtensions": true,
    "skipLibCheck": true,

    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",

    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },

    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Add the Tailwind import to the global stylesheet**

`tankctl-web/src/index.css` — add as the very first line (everything else in the file stays for now; `tokens.css`/`ui.css` are rewritten/removed in later tasks):

```css
@import "tailwindcss";
@import './styles/tokens.css';
@import './styles/ui.css';

/* ...rest of file unchanged... */
```

- [ ] **Step 5: Verify the dev server still runs**

Run: `npm run dev` (from `tankctl-web/`)
Expected: server starts with no errors, app loads at the printed localhost URL looking unchanged (Tailwind is imported but nothing uses its classes yet).

- [ ] **Step 6: Commit**

```bash
git add tankctl-web/package.json tankctl-web/package-lock.json tankctl-web/vite.config.ts tankctl-web/tsconfig.json tankctl-web/tsconfig.app.json tankctl-web/src/index.css
git commit -m "chore: add Tailwind v4 and @ path alias"
```

---

### Task 2: shadcn init + generate primitives

**Files:**
- Create: `tankctl-web/components.json`
- Create: `tankctl-web/src/lib/utils.ts`
- Create: `tankctl-web/src/components/ui/button.tsx`, `card.tsx`, `tabs.tsx`, `dialog.tsx`, `badge.tsx`, `input.tsx`, `select.tsx`, `textarea.tsx`, `form.tsx`, `calendar.tsx`, `table.tsx`, `sonner.tsx`, `tooltip.tsx` (generated — exact contents come from the CLI, not hand-written)
- Modify: `tankctl-web/src/index.css` (the CLI appends its own `@theme`/`:root`/`.dark` blocks here — normalized away in Task 3)
- Modify: `tankctl-web/package.json` (new deps: `class-variance-authority`, `clsx`, `tailwind-merge`, `radix-ui` packages per component, `lucide-react` already present)

**Interfaces:**
- Consumes: the `@` alias and Tailwind import from Task 1.
- Produces: `cn()` from `@/lib/utils`, and every `@/components/ui/*` primitive Tasks 4–23 import.

- [ ] **Step 1: Run shadcn init**

```bash
cd tankctl-web
npx shadcn@latest init
```

Answer the prompts: style **New York**, base color **Neutral**, CSS variables **yes**. Accept the detected React/Vite framework, `src/index.css` as the global stylesheet, `@/components` and `@/lib/utils` as the aliases (these match what Task 1 set up).

- [ ] **Step 2: Generate every primitive this migration needs**

```bash
npx shadcn@latest add button card tabs dialog badge input select textarea form calendar table sonner tooltip
```

- [ ] **Step 3: Verify the project still builds**

Run: `npm run build` (from `tankctl-web/`)
Expected: TypeScript + Vite build succeeds. `src/components/ui/` now contains one file per primitive listed above, `src/lib/utils.ts` exports `cn`, `components.json` exists at the project root.

- [ ] **Step 4: Commit**

```bash
git add tankctl-web/components.json tankctl-web/src/lib/utils.ts tankctl-web/src/components/ui tankctl-web/src/index.css tankctl-web/package.json tankctl-web/package-lock.json
git commit -m "chore: shadcn init, generate button/card/tabs/dialog/badge/input/select/textarea/form/calendar/table/sonner/tooltip"
```

---

### Task 3: Token/theme mapping + next-themes

**Files:**
- Modify: `tankctl-web/src/styles/tokens.css` (full rewrite)
- Modify: `tankctl-web/src/index.css` (remove the duplicate variable blocks the CLI injected in Task 2, step 1 — they're superseded by the rewritten `tokens.css`)
- Modify: `tankctl-web/src/App.tsx` (wrap with `ThemeProvider`)
- Modify: `tankctl-web/package.json` (new dep: `next-themes`)

**Interfaces:**
- Consumes: `@theme inline` variable names shadcn's generated `ui/*` components already reference (`--background`, `--foreground`, `--card`, `--primary`, `--primary-foreground`, `--secondary`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--destructive`, `--border`, `--input`, `--ring`, `--radius`).
- Produces: light values in `:root`, dark values in `.dark` — `next-themes` toggles the `dark` class on `<html>`. `--safe`, `--warn`, `--series-temp`, `--series-humid` extra tokens stay available in both blocks for code that reads them directly (charts, `StatusPill`/`Badge` variants).

- [ ] **Step 1: Install next-themes**

```bash
cd tankctl-web
npm install next-themes
```

- [ ] **Step 2: Rewrite tokens.css with light + dark blocks**

`tankctl-web/src/styles/tokens.css`:

```css
/* Design tokens — shadcn CSS-variable convention. Light is the new default
   register (Linear/Vercel craft bar per docs/ui/01_spec.md); dark ports the
   original amber-on-near-black palette this app shipped with first. */
:root {
  --background: #fafafa;
  --foreground: #18181b;
  --card: #ffffff;
  --card-foreground: #18181b;
  --popover: #ffffff;
  --popover-foreground: #18181b;

  --primary: #d97706;
  --primary-foreground: #fffbeb;
  --secondary: #f4f4f5;
  --secondary-foreground: #18181b;
  --muted: #f4f4f5;
  --muted-foreground: #71717a;
  --accent: #f4f4f5;
  --accent-foreground: #18181b;

  --destructive: #dc2626;
  --destructive-foreground: #fef2f2;

  --border: #e4e4e7;
  --input: #e4e4e7;
  --ring: #d97706;

  --safe: #16a34a;
  --safe-fill: rgba(22, 163, 74, 0.1);
  --warn: #7c3aed;
  --warn-fill: rgba(124, 58, 237, 0.1);
  --danger: var(--destructive);
  --danger-fill: rgba(220, 38, 38, 0.1);

  --series-temp: #2563eb;
  --series-temp-fill: rgba(37, 99, 235, 0.1);
  --series-humid: #16a34a;
  --series-humid-fill: rgba(22, 163, 74, 0.1);

  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  --font-mono: ui-monospace, 'Cascadia Code', 'SF Mono', Menlo, Consolas, monospace;

  --radius: 0.5rem;
  --shadow-focus: 0 0 0 3px color-mix(in oklab, var(--ring) 40%, transparent);

  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --dur-fast: 120ms;
  --dur-base: 200ms;

  color-scheme: light;
}

.dark {
  --background: #0a0a0b;
  --foreground: #f2f2ee;
  --card: #131316;
  --card-foreground: #f2f2ee;
  --popover: #131316;
  --popover-foreground: #f2f2ee;

  --primary: #f59e0b;
  --primary-foreground: #14100a;
  --secondary: #1c1c20;
  --secondary-foreground: #f2f2ee;
  --muted: #1c1c20;
  --muted-foreground: #a3a3a0;
  --accent: #1c1c20;
  --accent-foreground: #f2f2ee;

  --destructive: #f87171;
  --destructive-foreground: #14100a;

  --border: #26262b;
  --input: #37373e;
  --ring: #f59e0b;

  --safe: #4ade80;
  --safe-fill: rgba(74, 222, 128, 0.14);
  --warn: #a78bfa;
  --warn-fill: rgba(167, 139, 250, 0.14);
  --danger: var(--destructive);
  --danger-fill: rgba(248, 113, 113, 0.14);

  --series-temp: #60a5fa;
  --series-temp-fill: rgba(96, 165, 250, 0.14);
  --series-humid: #4ade80;
  --series-humid-fill: rgba(74, 222, 128, 0.14);

  --shadow-focus: 0 0 0 3px var(--accent);

  color-scheme: dark;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}
```

- [ ] **Step 3: Remove the CLI's duplicate variable blocks from index.css**

Open `tankctl-web/src/index.css`. The `shadcn init` step injected its own `@theme inline { ... }` and `:root { ... }` / `.dark { ... }` blocks (with stock shadcn colors) somewhere in this file — delete those blocks entirely; `tokens.css` (imported at the top) is now the only source of these variables. Leave the rest of `index.css` (the box-sizing reset, `body`, `.mono`, `.hud-frame`, scrollbar rules, etc.) untouched — those still apply.

- [ ] **Step 4: Wrap the app in ThemeProvider**

`tankctl-web/src/App.tsx`:

```tsx
import { ThemeProvider } from 'next-themes'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { LiveEventsProvider } from './ws/LiveEventsProvider'
import { AppShell } from './components/AppShell'
import { Overview } from './routes/Overview'
import { TankDetail } from './routes/TankDetail'
import { Alerts } from './routes/Alerts'
import { Settings } from './routes/Settings'
import { NotFound } from './routes/NotFound'
import { useGlobalLiveSync } from './ws/useGlobalLiveSync'
import { Toaster } from './components/ui/sonner'
import { TooltipProvider } from './components/ui/tooltip'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function GlobalLiveSync() {
  useGlobalLiveSync()
  return null
}

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <LiveEventsProvider>
            <TooltipProvider>
              <GlobalLiveSync />
              <Toaster />
              <Routes>
                <Route element={<AppShell />}>
                  <Route index element={<Overview />} />
                  <Route path="tanks/:deviceId" element={<TankDetail />} />
                  <Route path="alerts" element={<Alerts />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
            </TooltipProvider>
          </LiveEventsProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
```

Note `ToastProvider` is removed here already (Task 10 deletes `Toast.tsx` itself and converts every remaining `useToast()` call site) — `<Toaster />` from `sonner` replaces it as the single mount point.

- [ ] **Step 5: Verify both themes render**

Run: `npm run dev`, open the app. Toggle the OS/browser color-scheme preference (or temporarily add `<html class="dark">` in devtools) and confirm the background/text swap between the new light palette and the original dark amber palette without a flash on reload.

- [ ] **Step 6: Commit**

```bash
git add tankctl-web/src/styles/tokens.css tankctl-web/src/index.css tankctl-web/src/App.tsx tankctl-web/package.json tankctl-web/package-lock.json
git commit -m "feat: map tokens to shadcn CSS variables, add light mode via next-themes"
```

---

### Task 4: AppShell.tsx — nav reskin + theme toggle

**Files:**
- Modify: `tankctl-web/src/components/AppShell.tsx`
- Delete: `tankctl-web/src/components/AppShell.css` (import removed here; file itself removed in Task 24's sweep — leave it on disk unreferenced until then is fine, but removing the import now means removing the file now is safe too since nothing else imports `AppShell.css`)

**Interfaces:**
- Consumes: `StatusPill` (Task 5's rewritten version — same `{ tone, label }` props), `next-themes`' `useTheme`.
- Produces: no external API change — `AppShell` still just renders `<Outlet />` inside the shell, used unchanged by `App.tsx`.

- [ ] **Step 1: Rewrite AppShell.tsx with Tailwind, add the theme toggle**

```tsx
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { useLiveConnectionStatus } from '../ws/LiveEventsProvider'
import { StatusPill } from './StatusPill'
import { Button } from './ui/button'
import { IconAlerts, IconOverview, IconSettings } from './icons'

const NAV_ITEMS = [
  { to: '/', end: true, label: 'Overview', Icon: IconOverview },
  { to: '/alerts', end: false, label: 'Alerts', Icon: IconAlerts },
  { to: '/settings', end: false, label: 'Settings', Icon: IconSettings },
]

export function AppShell() {
  const status = useLiveConnectionStatus()
  const location = useLocation()
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <div className="flex min-h-full">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <aside className="flex w-56 shrink-0 flex-col border-r bg-card px-3 py-4">
        <div className="mb-6 flex items-center gap-2 px-2 text-sm font-semibold">
          <span
            aria-hidden="true"
            className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground"
          >
            T
          </span>
          TankCtl
        </div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ to, end, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `relative flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="app-shell-active-nav"
                      className="absolute inset-0 -z-10 rounded-md bg-accent"
                      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                    />
                  )}
                  <Icon size={18} />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex items-center justify-between gap-2 px-2 pt-4">
          <StatusPill
            tone={status === 'connected' ? 'ok' : status === 'polling-fallback' ? 'danger' : 'warn'}
            label={status === 'connected' ? 'Live' : status === 'polling-fallback' ? 'Polling' : 'Reconnecting'}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          >
            {resolvedTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </Button>
        </div>
      </aside>
      <main id="main-content" className="flex-1 overflow-y-auto p-6">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Delete the now-unused CSS file**

```bash
rm tankctl-web/src/components/AppShell.css
```

- [ ] **Step 3: Verify in browser**

Run: `npm run dev`. Confirm the sidebar renders, nav active-state highlight still animates between routes, the connection-status pill still shows, and the new theme toggle button switches light/dark instantly and persists across a reload (next-themes writes to `localStorage`).

- [ ] **Step 4: Commit**

```bash
git add tankctl-web/src/components/AppShell.tsx
git rm tankctl-web/src/components/AppShell.css
git commit -m "refactor: reskin AppShell with Tailwind, add theme toggle"
```

---

### Task 5: StatusPill.tsx → Badge-based rewrite

**Files:**
- Modify: `tankctl-web/src/components/StatusPill.tsx`
- Delete: `tankctl-web/src/components/StatusPill.css`

**Interfaces:**
- Consumes: `Badge` from `./ui/badge`.
- Produces: same external API as before — `StatusPill({ tone: 'ok' | 'warn' | 'danger', label?: string })` — so `AppShell`, `TankCard`, `TankDetail` need no changes.

- [ ] **Step 1: Rewrite StatusPill.tsx**

```tsx
import { Badge } from './ui/badge'
import { cn } from '../lib/utils'

export type PillTone = 'ok' | 'warn' | 'danger'

const TONE_LABEL: Record<PillTone, string> = {
  ok: 'Online',
  warn: 'Reconnecting',
  danger: 'Offline',
}

const TONE_CLASS: Record<PillTone, string> = {
  ok: 'border-transparent bg-[var(--safe-fill)] text-[var(--safe)]',
  warn: 'border-transparent bg-[var(--warn-fill)] text-[var(--warn)]',
  danger: 'border-transparent bg-[var(--danger-fill)] text-[var(--danger)]',
}

const DOT_CLASS: Record<PillTone, string> = {
  ok: 'bg-[var(--safe)]',
  warn: 'bg-[var(--warn)]',
  danger: 'bg-[var(--danger)]',
}

export function StatusPill({ tone, label }: { tone: PillTone; label?: string }) {
  return (
    <Badge role="status" className={cn('gap-1.5 font-medium', TONE_CLASS[tone])}>
      <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', DOT_CLASS[tone])} />
      {label ?? TONE_LABEL[tone]}
    </Badge>
  )
}
```

- [ ] **Step 2: Delete the now-unused CSS file**

```bash
rm tankctl-web/src/components/StatusPill.css
```

- [ ] **Step 3: Verify in browser**

Confirm the pill still renders in the sidebar (AppShell), on `TankCard`s (Overview), and on `TankDetail`'s header, with correct colors per tone in both themes.

- [ ] **Step 4: Commit**

```bash
git add tankctl-web/src/components/StatusPill.tsx
git rm tankctl-web/src/components/StatusPill.css
git commit -m "refactor: rebuild StatusPill on shadcn Badge"
```

---

### Task 6: EmptyState.tsx reskin

**Files:**
- Modify: `tankctl-web/src/components/EmptyState.tsx`
- Delete: `tankctl-web/src/components/EmptyState.css`

**Interfaces:**
- Produces: same API — `EmptyState({ title, description?, action? })`.

- [ ] **Step 1: Rewrite EmptyState.tsx**

```tsx
import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { IconInbox } from './icons'

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <motion.div
      className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center text-muted-foreground"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
    >
      <IconInbox size={28} strokeWidth={1.5} />
      <p className="font-medium text-foreground">{title}</p>
      {description && <p className="text-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </motion.div>
  )
}
```

- [ ] **Step 2: Delete the now-unused CSS file**

```bash
rm tankctl-web/src/components/EmptyState.css
```

- [ ] **Step 3: Verify in browser**

Trigger an empty state (e.g. Overview with a search term that matches nothing) and confirm it renders centered with the dashed border, icon, title, description.

- [ ] **Step 4: Commit**

```bash
git add tankctl-web/src/components/EmptyState.tsx
git rm tankctl-web/src/components/EmptyState.css
git commit -m "refactor: reskin EmptyState with Tailwind"
```

---

### Task 7: StatTile.tsx reskin

**Files:**
- Modify: `tankctl-web/src/components/StatTile.tsx`
- Delete: `tankctl-web/src/components/StatTile.css`

**Interfaces:**
- Produces: same API — `StatTile({ label, value, unit?, delta? })`. Internal `AnimatedValue` spring logic is untouched.

- [ ] **Step 1: Rewrite StatTile.tsx (only the JSX/classNames change — `AnimatedValue` stays identical)**

```tsx
import { useEffect, useState } from 'react'
import { motion, useMotionValue, useMotionValueEvent, useSpring } from 'motion/react'

const NUMERIC = /^-?\d+(\.\d+)?$/

function AnimatedValue({ value }: { value: string }) {
  const trimmed = value.trim()
  const isNumeric = NUMERIC.test(trimmed)
  const decimals = isNumeric && trimmed.includes('.') ? trimmed.split('.')[1].length : 0

  const target = isNumeric ? Number(trimmed) : 0
  const motionValue = useMotionValue(target)
  const spring = useSpring(motionValue, { stiffness: 120, damping: 20 })
  const [display, setDisplay] = useState(trimmed)

  useEffect(() => {
    if (isNumeric) motionValue.set(target)
    else setDisplay(trimmed)
  }, [target, isNumeric, trimmed, motionValue])

  useMotionValueEvent(spring, 'change', (latest) => {
    if (isNumeric) setDisplay(latest.toFixed(decimals))
  })

  return <>{display}</>
}

export function StatTile({
  label,
  value,
  unit,
  delta,
}: {
  label: string
  value: string
  unit?: string
  delta?: string
}) {
  return (
    <motion.div className="rounded-lg border bg-card p-4" layout>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">
        <AnimatedValue value={value} />
        {unit && <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>}
      </div>
      {delta && <div className="mt-1 font-mono text-xs text-muted-foreground">{delta}</div>}
    </motion.div>
  )
}
```

- [ ] **Step 2: Delete the now-unused CSS file**

```bash
rm tankctl-web/src/components/StatTile.css
```

- [ ] **Step 3: Verify in browser**

Open Tank Detail, confirm the three stat tiles (water temperature, humidity, last seen) render as cards and the value spring-animation still runs when a new telemetry point arrives.

- [ ] **Step 4: Commit**

```bash
git add tankctl-web/src/components/StatTile.tsx
git rm tankctl-web/src/components/StatTile.css
git commit -m "refactor: reskin StatTile with Tailwind"
```

---

### Task 8: SearchFilterBar.tsx → Input/Select

**Files:**
- Modify: `tankctl-web/src/components/SearchFilterBar.tsx`
- Delete: `tankctl-web/src/components/SearchFilterBar.css`

**Interfaces:**
- Consumes: `Input` from `./ui/input`, `Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem` from `./ui/select`.
- Produces: same API — `SearchFilterBar({ search, onSearchChange, statusFilter, onStatusFilterChange, sortKey, onSortKeyChange })`, same exported `StatusFilter`/`SortKey` types.

- [ ] **Step 1: Rewrite SearchFilterBar.tsx**

```tsx
import { IconSearch } from './icons'
import { Input } from './ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

export type StatusFilter = 'all' | 'online' | 'offline'
export type SortKey = 'name' | 'status' | 'last-updated'

export function SearchFilterBar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sortKey,
  onSortKeyChange,
}: {
  search: string
  onSearchChange: (value: string) => void
  statusFilter: StatusFilter
  onStatusFilterChange: (value: StatusFilter) => void
  sortKey: SortKey
  onSortKeyChange: (value: SortKey) => void
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-48">
        <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search tanks…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search tanks"
          className="pl-9"
        />
      </div>
      <Select value={statusFilter} onValueChange={(v) => onStatusFilterChange(v as StatusFilter)}>
        <SelectTrigger aria-label="Filter by status" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="online">Online</SelectItem>
          <SelectItem value="offline">Offline</SelectItem>
        </SelectContent>
      </Select>
      <Select value={sortKey} onValueChange={(v) => onSortKeyChange(v as SortKey)}>
        <SelectTrigger aria-label="Sort tanks" className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="name">Sort: name</SelectItem>
          <SelectItem value="status">Sort: status</SelectItem>
          <SelectItem value="last-updated">Sort: last updated</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
```

- [ ] **Step 2: Delete the now-unused CSS file**

```bash
rm tankctl-web/src/components/SearchFilterBar.css
```

- [ ] **Step 3: Verify in browser**

On Overview, confirm search filters the grid live, both selects open/close and filter/sort correctly.

- [ ] **Step 4: Commit**

```bash
git add tankctl-web/src/components/SearchFilterBar.tsx
git rm tankctl-web/src/components/SearchFilterBar.css
git commit -m "refactor: rebuild SearchFilterBar on shadcn Input/Select"
```

---

### Task 9: Tabs.tsx → Radix Tabs

**Files:**
- Modify: `tankctl-web/src/components/Tabs.tsx`
- Delete: `tankctl-web/src/components/Tabs.css`

**Interfaces:**
- Consumes: `Tabs`/`TabsList`/`TabsTrigger` from `./ui/tabs` (only the trigger row is used — `TankDetail.tsx` still renders panels manually based on `activeId`, so `TabsContent` is intentionally not used here).
- Produces: same API — `Tabs({ tabs: TabDef[], activeId, onChange })`, same exported `TabDef` type. `TankDetail.tsx` needs no changes.

- [ ] **Step 1: Rewrite Tabs.tsx**

```tsx
import type { LucideIcon } from 'lucide-react'
import { Tabs as TabsRoot, TabsList, TabsTrigger } from './ui/tabs'

export interface TabDef {
  id: string
  label: string
  Icon?: LucideIcon
}

export function Tabs({
  tabs,
  activeId,
  onChange,
}: {
  tabs: TabDef[]
  activeId: string
  onChange: (id: string) => void
}) {
  return (
    <TabsRoot value={activeId} onValueChange={onChange}>
      <TabsList>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id} className="gap-1.5">
            {tab.Icon && <tab.Icon size={14} />}
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </TabsRoot>
  )
}
```

- [ ] **Step 2: Delete the now-unused CSS file**

```bash
rm tankctl-web/src/components/Tabs.css
```

- [ ] **Step 3: Verify in browser**

On Tank Detail, confirm all four tabs (Light/Relays/Water/Commands) switch correctly, keyboard arrow-key navigation between tabs works (Radix gives this for free), and the active tab persists across a reload (existing `localStorage` logic in `TankDetail.tsx` is untouched).

- [ ] **Step 4: Commit**

```bash
git add tankctl-web/src/components/Tabs.tsx
git rm tankctl-web/src/components/Tabs.css
git commit -m "refactor: rebuild Tabs on Radix Tabs (shadcn)"
```

---

### Task 10: Remove Toast.tsx, mount sonner Toaster

**Files:**
- Delete: `tankctl-web/src/components/Toast.tsx`
- Delete: `tankctl-web/src/components/Toast.css`
- Already modified in Task 3: `tankctl-web/src/App.tsx` (already mounts `<Toaster />`, already dropped `<ToastProvider>`)

**Interfaces:**
- Produces: `import { toast } from 'sonner'` is now the only way to raise a toast. Every remaining `import { useToast } from '.../Toast'` call site (WaterTab, Alerts, Settings, LightTab, RelaysTab — Tasks 15, 16, 19, 20, 22) is converted **in that file's own task**, not here. This task only removes the old provider/component so those later tasks have nothing to fall back to.

- [ ] **Step 1: Delete Toast.tsx and Toast.css**

```bash
rm tankctl-web/src/components/Toast.tsx tankctl-web/src/components/Toast.css
```

- [ ] **Step 2: Confirm the build now fails exactly where expected**

Run: `npm run build`
Expected: TypeScript errors on every remaining `from '../components/Toast'` / `from '../../components/Toast'` import (in `WaterTab.tsx`, `Alerts.tsx`, `Settings.tsx`, `LightTab.tsx`, `RelaysTab.tsx`, `TankCard.tsx`). This is expected and intentional — each of those files converts its own calls in its own later task in this plan. Do not fix them here.

- [ ] **Step 3: Commit**

```bash
git add -A tankctl-web/src/components/Toast.tsx tankctl-web/src/components/Toast.css
git commit -m "chore: remove Toast.tsx/ToastProvider — sonner Toaster now mounted in App.tsx"
```

---

### Task 11: LineChart.tsx — Tailwind reskin + hover tooltip

**Files:**
- Modify: `tankctl-web/src/components/LineChart.tsx`
- Delete: `tankctl-web/src/components/LineChart.css`

**Interfaces:**
- Consumes: `Tooltip`/`TooltipTrigger`/`TooltipContent` from `./ui/tooltip` (mounted under the app-wide `TooltipProvider` added in Task 3). `Button` from `./ui/button` (table-toggle). `Table` family from `./ui/table`.
- Produces: same external API — `LineChart({ data, unit?, color, fillColor, stale?, dayTicks?, ariaLabel, height? })`, same `ChartPoint` export. `TankDetail.tsx` needs no changes.

- [ ] **Step 1: Rewrite LineChart.tsx, adding a controlled Tooltip anchored to the hover marker**

```tsx
import { useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Button } from './ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

export interface ChartPoint {
  t: Date
  value: number
}

interface LineChartProps {
  data: ChartPoint[]
  unit?: string
  color: string
  fillColor: string
  stale?: boolean
  dayTicks?: boolean
  ariaLabel: string
  height?: number
}

const PAD_L = 42
const PAD_R = 14
const PAD_T = 14
const PAD_B = 24
const WIDTH = 720

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
function formatDate(d: Date) {
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function LineChart({ data, unit = '', color, fillColor, stale, dayTicks, ariaLabel, height = 200 }: LineChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)
  const svgRef = useRef<SVGSVGElement | null>(null)

  const plotW = WIDTH - PAD_L - PAD_R
  const plotH = height - PAD_T - PAD_B

  const { path, areaPath, x, y, gridSteps } = useMemo(() => {
    if (data.length === 0) {
      return { path: '', areaPath: '', x: () => 0, y: () => 0, gridSteps: [] as number[] }
    }
    const values = data.map((d) => d.value)
    let min = Math.min(...values)
    let max = Math.max(...values)
    const padValue = (max - min) * 0.15 || 1
    min -= padValue
    max += padValue

    const xScale = (i: number) => PAD_L + (data.length === 1 ? 0 : (i / (data.length - 1)) * plotW)
    const yScale = (v: number) => PAD_T + plotH - ((v - min) / (max - min)) * plotH

    let d0 = `M${xScale(0)},${yScale(data[0].value)}`
    for (let i = 1; i < data.length; i++) d0 += ` L${xScale(i)},${yScale(data[i].value)}`
    const area = `${d0} L${xScale(data.length - 1)},${PAD_T + plotH} L${xScale(0)},${PAD_T + plotH} Z`

    const steps = 4
    const grid = Array.from({ length: steps + 1 }, (_, s) => min + (max - min) * (s / steps))

    return { path: d0, areaPath: area, x: xScale, y: yScale, gridSteps: grid }
  }, [data, plotH, plotW])

  if (data.length === 0) {
    return <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No data yet</div>
  }

  const lastIdx = data.length - 1
  const activeIdx = hoverIdx ?? lastIdx
  const active = data[activeIdx]

  function handleMove(evt: React.PointerEvent<SVGRectElement>) {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const px = ((evt.clientX - rect.left) * WIDTH) / rect.width
    const idx = Math.max(0, Math.min(lastIdx, Math.round(((px - PAD_L) / plotW) * lastIdx)))
    setHoverIdx(idx)
  }

  function tooltipText(idx: number) {
    const p = data[idx]
    return `${dayTicks ? formatDate(p.t) : formatTime(p.t)} · ${p.value.toFixed(1)}${unit}`
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${height}`}
          role="img"
          aria-label={ariaLabel}
          className="block h-auto w-full cursor-crosshair"
        >
          {gridSteps.map((v, i) => (
            <g key={i}>
              <line
                x1={PAD_L}
                x2={WIDTH - PAD_R}
                y1={y(v)}
                y2={y(v)}
                stroke="var(--border)"
                strokeWidth={1}
                strokeDasharray="2 3"
              />
              <text x={PAD_L - 8} y={y(v) + 3.5} textAnchor="end" className="fill-muted-foreground font-mono text-[10px]">
                {v.toFixed(0)}
                {unit}
              </text>
            </g>
          ))}
          <motion.path
            d={areaPath}
            fill={fillColor}
            stroke="none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          />
          <motion.path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          />
          {[0, 1, 2, 3, 4].map((tick) => {
            const idx = Math.round(lastIdx * (tick / 4))
            return (
              <text
                key={tick}
                x={x(idx)}
                y={height - 8}
                textAnchor={tick === 0 ? 'start' : tick === 4 ? 'end' : 'middle'}
                className="fill-muted-foreground font-mono text-[10px]"
              >
                {dayTicks ? formatDate(data[idx].t) : formatTime(data[idx].t)}
              </text>
            )
          })}
          <circle cx={x(lastIdx)} cy={y(data[lastIdx].value)} r={7} fill="var(--card)" />
          <circle cx={x(lastIdx)} cy={y(data[lastIdx].value)} r={5} fill={stale ? 'var(--muted-foreground)' : color} />
          <Tooltip open={hoverIdx !== null}>
            <TooltipTrigger asChild>
              <circle
                cx={x(hoverIdx ?? lastIdx)}
                cy={y(data[hoverIdx ?? lastIdx].value)}
                r={5}
                fill={color}
                stroke="var(--card)"
                strokeWidth={2}
                opacity={hoverIdx === null ? 0 : 1}
              />
            </TooltipTrigger>
            <TooltipContent>{tooltipText(hoverIdx ?? lastIdx)}</TooltipContent>
          </Tooltip>
          {hoverIdx !== null && (
            <line x1={x(hoverIdx)} x2={x(hoverIdx)} y1={PAD_T} y2={PAD_T + plotH} stroke="var(--muted-foreground)" strokeWidth={1} />
          )}
          <rect
            x={PAD_L}
            y={PAD_T}
            width={plotW}
            height={plotH}
            fill="transparent"
            onPointerMove={handleMove}
            onPointerLeave={() => setHoverIdx(null)}
          />
        </svg>
        <div className="mt-1 font-mono text-xs text-muted-foreground">
          {dayTicks ? formatDate(active.t) : formatTime(active.t)} · {active.value.toFixed(1)}
          {unit}
          {stale && activeIdx === lastIdx && <span className="ml-1 font-semibold text-[var(--warn)]"> · stale</span>}
        </div>
      </div>
      <Button type="button" variant="ghost" size="sm" className="self-start text-xs underline decoration-dotted" onClick={() => setShowTable((s) => !s)}>
        {showTable ? 'Hide table' : 'View as table'}
      </Button>
      {showTable && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.slice(-24).map((d, i) => (
              <TableRow key={i}>
                <TableCell className="font-mono">
                  {formatTime(d.t)} · {formatDate(d.t)}
                </TableCell>
                <TableCell className="font-mono">
                  {d.value.toFixed(1)}
                  {unit}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
```

The `Tooltip` is controlled via `open={hoverIdx !== null}` rather than relying on Radix's own hover detection, because the trigger (the hover-following `<circle>`) is one persistent element whose position we already move on every pointer event — Radix's Floating-UI positioning re-anchors to that element's new DOM rect each render, so this "moves with the pointer" correctly without fighting Radix's hover heuristics.

- [ ] **Step 2: Delete the now-unused CSS file**

```bash
rm tankctl-web/src/components/LineChart.css
```

- [ ] **Step 3: Verify in browser**

On Tank Detail, hover the temperature/humidity charts: confirm a tooltip bubble follows the cursor showing time + value, the below-chart readout still updates too, and "View as table" still toggles the data table.

- [ ] **Step 4: Commit**

```bash
git add tankctl-web/src/components/LineChart.tsx
git rm tankctl-web/src/components/LineChart.css
git commit -m "feat: reskin LineChart, add hover tooltip via shadcn Tooltip"
```

---

### Task 12: Sparkline.tsx + useLiveSparkline — live data, dots, pulsing latest point

**Files:**
- Modify: `tankctl-web/src/components/Sparkline.tsx`
- Create: `tankctl-web/src/features/overview/useLiveSparkline.ts`
- Delete: none (Sparkline had no dedicated CSS file)

**Interfaces:**
- Consumes: `useSparkline` from `../api/telemetry` (existing, unchanged — the 60s-polled seed query), `useLiveEvent` from `../ws/LiveEventsProvider` (existing), `Tooltip` family from `../components/ui/tooltip`.
- Produces: `useLiveSparkline(deviceId: string): SparklinePoint[]` (new hook, consumed by Task 13's `TankCard.tsx`). `Sparkline({ data: SparklineDatum[], color: string })` — **breaking change** from the old `{ values: number[], color }` API; Task 13 updates its only call site in the same migration pass.

- [ ] **Step 1: Create the live-tail hook**

`tankctl-web/src/features/overview/useLiveSparkline.ts`:

```ts
import { useEffect, useRef, useState } from 'react'
import { useSparkline } from '../../api/telemetry'
import { useLiveEvent } from '../../ws/LiveEventsProvider'

export interface SparklinePoint {
  t: Date
  value: number
}

const SPARKLINE_MAX = 12

/**
 * Mirrors useTankTelemetry's live-tail pattern (seed from a query, then
 * append via the telemetry_received WS event) scoped down to one series
 * for the Overview grid's per-card sparkline.
 */
export function useLiveSparkline(deviceId: string): SparklinePoint[] {
  const { data } = useSparkline(deviceId)
  const [points, setPoints] = useState<SparklinePoint[]>([])
  const seededForRef = useRef<string | null>(null)

  useEffect(() => {
    if (!data) return
    const seedKey = `${deviceId}:${data.count}`
    if (seededForRef.current === seedKey) return
    seededForRef.current = seedKey
    setPoints(
      data.data
        .filter((p) => p.temperature !== null)
        .map((p) => ({ t: new Date(p.time), value: p.temperature as number })),
    )
  }, [data, deviceId])

  useLiveEvent(['telemetry_received'], (event) => {
    if (event.device_id !== deviceId) return
    const meta = (event.metadata ?? {}) as Record<string, unknown>
    const temperature = typeof meta.temperature === 'number' ? meta.temperature : undefined
    if (temperature === undefined) return
    const t = new Date(event.timestamp * 1000)
    setPoints((prev) => [...prev.slice(-(SPARKLINE_MAX - 1)), { t, value: temperature }])
  })

  return points
}
```

- [ ] **Step 2: Rewrite Sparkline.tsx with dots, pulsing latest point, and per-dot tooltips**

```tsx
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'

export interface SparklineDatum {
  t: Date
  value: number
}

/** Glance-level trend indicator for TankCard, now WS-live: dots mark every
 * point, the latest pulses. Still not the accessible chart (that's
 * LineChart on Tank Detail) — decorative but interactive on hover. */
export function Sparkline({ data, color }: { data: SparklineDatum[]; color: string }) {
  if (data.length < 2) return null

  const width = 120
  const height = 32
  const values = data.map((d) => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const coords = data.map((d, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - ((d.value - min) / range) * height,
    d,
  }))
  const points = coords.map((c) => `${c.x},${c.y}`).join(' ')
  const last = coords[coords.length - 1]

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="overflow-visible">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {coords.slice(0, -1).map((c, i) => (
        <Tooltip key={i}>
          <TooltipTrigger asChild>
            <circle cx={c.x} cy={c.y} r={2} fill={color} className="cursor-pointer" />
          </TooltipTrigger>
          <TooltipContent>{c.d.value.toFixed(1)}°C</TooltipContent>
        </Tooltip>
      ))}
      <Tooltip>
        <TooltipTrigger asChild>
          <circle
            cx={last.x}
            cy={last.y}
            r={3}
            fill={color}
            className="cursor-pointer animate-pulse motion-reduce:animate-none"
          />
        </TooltipTrigger>
        <TooltipContent>{last.d.value.toFixed(1)}°C · live</TooltipContent>
      </Tooltip>
    </svg>
  )
}
```

- [ ] **Step 3: Verify in browser (partial — full check happens once Task 13 wires the new hook into TankCard)**

Run: `npm run build`. Expected: `Sparkline.tsx` and `useLiveSparkline.ts` compile cleanly on their own; `TankCard.tsx` will show a type error against the old `{ values }` prop shape until Task 13 — that's expected here, don't fix it in this task.

- [ ] **Step 4: Commit**

```bash
git add tankctl-web/src/components/Sparkline.tsx tankctl-web/src/features/overview/useLiveSparkline.ts
git commit -m "feat: live-tail sparkline data hook, per-point markers, pulsing latest point"
```

---

### Task 13: TankCard.tsx — Card reskin + live sparkline + toast conversion

**Files:**
- Modify: `tankctl-web/src/components/TankCard.tsx`
- Delete: `tankctl-web/src/components/TankCard.css`

**Interfaces:**
- Consumes: `useLiveSparkline` from `../features/overview/useLiveSparkline` (Task 12), `Sparkline` (new `{ data, color }` shape, Task 12), `toast` from `sonner`, `Button` from `./ui/button`, `Badge` for the alert-count pill.
- Produces: same external API — `TankCard({ device, alertCount })`. `Overview.tsx` needs no changes.

- [ ] **Step 1: Rewrite TankCard.tsx**

```tsx
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import type { Device } from '../api/types'
import { StatusPill, type PillTone } from './StatusPill'
import { Sparkline } from './Sparkline'
import { useSetLight } from '../api/commands'
import { useLiveSparkline } from '../features/overview/useLiveSparkline'
import { Button } from './ui/button'
import { Badge } from './ui/badge'

function statusTone(status: Device['status']): PillTone {
  if (status === 'online') return 'ok'
  if (status === 'time_unknown') return 'warn'
  return 'danger'
}

export function TankCard({ device, alertCount }: { device: Device; alertCount: number }) {
  const setLight = useSetLight(device.device_id)
  const sparklineData = useLiveSparkline(device.device_id)

  function handleSetLight(e: React.MouseEvent, state: 'on' | 'off') {
    e.preventDefault()
    e.stopPropagation()
    setLight.mutate(state, {
      onError: () => toast.error(`Couldn't set light for ${device.device_name ?? device.device_id}`),
    })
  }

  return (
    <Link
      to={`/tanks/${device.device_id}`}
      className="relative flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/50"
    >
      <div className="flex items-center justify-between">
        <span className="font-medium">{device.device_name ?? device.device_id}</span>
        <StatusPill tone={statusTone(device.status)} />
      </div>
      {sparklineData.length > 1 && (
        <div className="text-[var(--series-temp)]">
          <Sparkline data={sparklineData} color="var(--series-temp)" />
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={(e) => handleSetLight(e, 'on')} disabled={setLight.isPending}>
            Light on
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={(e) => handleSetLight(e, 'off')} disabled={setLight.isPending}>
            Light off
          </Button>
        </div>
        {alertCount > 0 && (
          <Badge variant="destructive" className="rounded-full px-2">
            {alertCount}
          </Badge>
        )}
      </div>
    </Link>
  )
}
```

- [ ] **Step 2: Delete the now-unused CSS file**

```bash
rm tankctl-web/src/components/TankCard.css
```

- [ ] **Step 3: Verify in browser**

On Overview: confirm each card's sparkline shows dots and a pulsing latest point, hovering a dot shows its tooltip, and — with the backend publishing telemetry — a live `telemetry_received` event visibly moves the line without waiting for the 60s poll. Light on/off buttons still work and don't navigate the card's link.

- [ ] **Step 4: Commit**

```bash
git add tankctl-web/src/components/TankCard.tsx
git rm tankctl-web/src/components/TankCard.css
git commit -m "feat: wire TankCard to WS-live sparkline, reskin with Tailwind"
```

---

### Task 14: Overview.tsx reskin

**Files:**
- Modify: `tankctl-web/src/routes/Overview.tsx`
- Delete: `tankctl-web/src/routes/Overview.css`

**Interfaces:**
- Consumes: `SearchFilterBar` (Task 8), `EmptyState` (Task 6), `TankCard` (Task 13) — all unchanged call signatures.

- [ ] **Step 1: Rewrite Overview.tsx (logic identical — only the grid wrapper className and page-title element change)**

```tsx
import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { useDevices } from '../api/devices'
import { useEvents } from '../api/events'
import { TankCard } from '../components/TankCard'
import { SearchFilterBar, type SortKey, type StatusFilter } from '../components/SearchFilterBar'
import { EmptyState } from '../components/EmptyState'

export function Overview() {
  const { data: devices, isLoading, isError } = useDevices()
  const { data: events } = useEvents({ limit: 200 })

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('name')

  const alertCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of events ?? []) {
      if (!e.device_id) continue
      counts.set(e.device_id, (counts.get(e.device_id) ?? 0) + 1)
    }
    return counts
  }, [events])

  const filtered = useMemo(() => {
    let list = devices ?? []
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (d) => (d.device_name ?? d.device_id).toLowerCase().includes(q) || d.device_id.toLowerCase().includes(q),
      )
    }
    if (statusFilter !== 'all') {
      list = list.filter((d) => (statusFilter === 'online' ? d.status === 'online' : d.status !== 'online'))
    }
    const sorted = [...list]
    if (sortKey === 'name') {
      sorted.sort((a, b) => (a.device_name ?? a.device_id).localeCompare(b.device_name ?? b.device_id))
    } else if (sortKey === 'status') {
      sorted.sort((a, b) => a.status.localeCompare(b.status))
    } else {
      sorted.sort((a, b) => (b.last_seen ?? '').localeCompare(a.last_seen ?? ''))
    }
    return sorted
  }, [devices, search, statusFilter, sortKey])

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading tanks…</p>
  if (isError) return <EmptyState title="Couldn't load tanks" description="Check that the backend is reachable, then try again." />

  if (!devices || devices.length === 0) {
    return <EmptyState title="No tanks registered yet" description="Register a device in Settings to see it here." />
  }

  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold tracking-tight">Tanks</h1>
      <SearchFilterBar
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        sortKey={sortKey}
        onSortKeyChange={setSortKey}
      />
      {filtered.length === 0 ? (
        <EmptyState title="No tanks match your search" description="Try a different search term or filter." />
      ) : (
        <motion.div
          className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4"
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.035 } } }}
        >
          {filtered.map((device) => (
            <motion.div
              key={device.device_id}
              variants={{
                hidden: { opacity: 0, y: 8 },
                show: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              <TankCard device={device} alertCount={alertCounts.get(device.device_id) ?? 0} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Delete the now-unused CSS file**

```bash
rm tankctl-web/src/routes/Overview.css
```

- [ ] **Step 3: Verify in browser**

Confirm the grid is responsive (resize the window — columns reflow, matching 01_spec.md's "usable at 20+ tanks" requirement), stagger-in animation still plays on load.

- [ ] **Step 4: Commit**

```bash
git add tankctl-web/src/routes/Overview.tsx
git rm tankctl-web/src/routes/Overview.css
git commit -m "refactor: reskin Overview grid with Tailwind"
```

---

### Task 15: Alerts.tsx — human-friendly event labels + reskin

**Files:**
- Create: `tankctl-web/src/lib/eventLabels.ts`
- Modify: `tankctl-web/src/routes/Alerts.tsx`
- Delete: `tankctl-web/src/routes/Alerts.css`

**Interfaces:**
- Produces: `EVENT_LABELS: Record<string, string>` and `eventLabel(event: string): string` from `../lib/eventLabels` — falls back to the raw string for any event type not in the map, so a future backend addition never breaks this UI.
- Consumes: `Select` family (Task 8's pattern), `Badge` for the status/type chip, `toast` from `sonner`.

- [ ] **Step 1: Create the event-label map**

`tankctl-web/src/lib/eventLabels.ts`:

```ts
/** Maps the backend's raw event-type strings (src/domain/event.py,
 * src/services/shadow_service.py, src/infrastructure/mqtt/handlers.py) to
 * human-friendly labels for the Alerts UI. Unknown/future types fall back
 * to the raw string rather than breaking. */
export const EVENT_LABELS: Record<string, string> = {
  device_registered: 'Device registered',
  device_online: 'Came online',
  device_offline: 'Went offline',
  command_sent: 'Command sent',
  command_executed: 'Command executed',
  command_failed: 'Command failed',
  light_state_changed: 'Light schedule changed',
  device_warning: 'Warning',
}

export function eventLabel(event: string): string {
  return EVENT_LABELS[event] ?? event
}
```

- [ ] **Step 2: Rewrite Alerts.tsx**

```tsx
import { useState } from 'react'
import { toast } from 'sonner'
import { useDevices } from '../api/devices'
import { useDismissAttention, useEventTypes, useEvents } from '../api/events'
import { EmptyState } from '../components/EmptyState'
import { Button } from '../components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { eventLabel } from '../lib/eventLabels'

export function Alerts() {
  const [deviceFilter, setDeviceFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const { data: devices } = useDevices()
  const { data: eventTypes } = useEventTypes()
  const { data: events, isLoading } = useEvents({
    deviceId: deviceFilter || undefined,
    eventType: typeFilter || undefined,
  })
  const dismiss = useDismissAttention()

  function deviceLabel(deviceId: string | null) {
    if (!deviceId) return '—'
    const d = devices?.find((dev) => dev.device_id === deviceId)
    return d?.device_name ?? deviceId
  }

  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold tracking-tight">Alerts</h1>
      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={deviceFilter || 'all'} onValueChange={(v) => setDeviceFilter(v === 'all' ? '' : v)}>
          <SelectTrigger aria-label="Filter by device" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All devices</SelectItem>
            {(devices ?? []).map((d) => (
              <SelectItem key={d.device_id} value={d.device_id}>
                {d.device_name ?? d.device_id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter || 'all'} onValueChange={(v) => setTypeFilter(v === 'all' ? '' : v)}>
          <SelectTrigger aria-label="Filter by event type" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {(eventTypes ?? []).map((t) => (
              <SelectItem key={t} value={t}>
                {eventLabel(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading alerts…</p>
      ) : !events || events.length === 0 ? (
        <EmptyState title="No alerts" description="Nothing to review right now." />
      ) : (
        <div className="divide-y rounded-lg border bg-card">
          {events.map((e, i) => {
            const meta = e.metadata as Record<string, unknown>
            const code = e.event === 'device_warning' && typeof meta.code === 'string' ? meta.code : null
            return (
              <div key={i} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">
                    {eventLabel(e.event)}
                    {code && <span className="ml-1.5 font-mono text-xs text-muted-foreground">({code})</span>}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {new Date(e.timestamp * 1000).toLocaleString()} · {deviceLabel(e.device_id)}
                    {typeof meta.message === 'string' ? ` · ${meta.message}` : ''}
                  </span>
                </div>
                {e.event === 'device_warning' && e.device_id && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={dismiss.isPending}
                    onClick={() =>
                      dismiss.mutate(
                        {
                          device_id: e.device_id as string,
                          issue_key: String(meta.code ?? 'unknown'),
                          issue_type: 'device_warning',
                        },
                        {
                          onSuccess: () => toast.success('Alert acknowledged'),
                          onError: () => toast.error('Failed to acknowledge alert'),
                        },
                      )
                    }
                  >
                    Acknowledge
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Delete the now-unused CSS file**

```bash
rm tankctl-web/src/routes/Alerts.css
```

- [ ] **Step 4: Verify in browser**

Confirm every alert row shows a human-friendly label (not the raw `device_warning` string), the type filter's options are labeled too, a `device_warning` row shows its `code` in parentheses when present, an unrecognized event type (temporarily fake one via devtools if needed) falls back to showing the raw string instead of erroring, and Acknowledge still dismisses correctly with a toast.

- [ ] **Step 5: Commit**

```bash
git add tankctl-web/src/lib/eventLabels.ts tankctl-web/src/routes/Alerts.tsx
git rm tankctl-web/src/routes/Alerts.css
git commit -m "feat: human-friendly alert event labels, reskin Alerts with shadcn Select"
```

---

### Task 16: Settings.tsx — react-hook-form register-device form + reskin

**Files:**
- Modify: `tankctl-web/src/routes/Settings.tsx`
- Delete: `tankctl-web/src/routes/Settings.css`
- Modify: `tankctl-web/package.json` (new deps: `react-hook-form`, `zod`, `@hookform/resolvers`)

**Interfaces:**
- Consumes: `Form`/`FormField`/`FormItem`/`FormLabel`/`FormControl`/`FormMessage`/`FormDescription` from `../components/ui/form`, `Input` from `../components/ui/input`, `Button` from `../components/ui/button`.

- [ ] **Step 1: Install the form deps (once — every later form task reuses these)**

```bash
cd tankctl-web
npm install react-hook-form zod @hookform/resolvers
```

- [ ] **Step 2: Rewrite Settings.tsx**

```tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useDevices, useRegisterDevice } from '../api/devices'
import { Button } from '../components/ui/button'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '../components/ui/form'
import { Input } from '../components/ui/input'

const registerSchema = z.object({
  deviceId: z
    .string()
    .min(1, 'Device ID is required')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Alphanumeric, underscore, hyphen only'),
})

export function Settings() {
  const { data: devices } = useDevices()
  const registerDevice = useRegisterDevice()
  const [secret, setSecret] = useState<{ device_secret: string; mqtt_password: string } | null>(null)

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { deviceId: '' },
  })

  function onSubmit(values: z.infer<typeof registerSchema>) {
    registerDevice.mutate(values.deviceId, {
      onSuccess: (res) => {
        setSecret({ device_secret: res.device_secret, mqtt_password: res.mqtt_password })
        form.reset()
      },
      onError: () => toast.error("Failed to register device — is the id already taken?"),
    })
  }

  return (
    <div>
      <h1 className="mb-5 text-2xl font-bold tracking-tight">Settings</h1>

      <section className="mb-6 rounded-lg border bg-card p-5">
        <h3 className="mb-4 font-semibold">Register a device</h3>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="deviceId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Device ID</FormLabel>
                  <FormControl>
                    <Input placeholder="tank1" {...field} />
                  </FormControl>
                  <FormDescription>Alphanumeric, underscore, hyphen only.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={registerDevice.isPending}>
              Register
            </Button>
          </form>
        </Form>

        {secret && (
          <div role="alert" className="mt-4 rounded-md border border-[var(--warn)] bg-[var(--warn-fill)] p-3">
            <p className="mb-2 text-sm font-medium">Copy these now — they will not be shown again.</p>
            <p className="font-mono text-sm">device_secret: {secret.device_secret}</p>
            <p className="font-mono text-sm">mqtt_password: {secret.mqtt_password}</p>
          </div>
        )}
      </section>

      <section className="rounded-lg border bg-card p-5">
        <h3 className="mb-4 font-semibold">Devices</h3>
        {(devices ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No devices registered yet.</p>
        ) : (
          <ul className="divide-y">
            {(devices ?? []).map((d) => (
              <li key={d.device_id} className="flex items-center justify-between gap-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{d.device_name ?? d.device_id}</span>
                  <span className="font-mono text-xs text-muted-foreground">{d.device_id}</span>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link to={`/tanks/${d.device_id}?tab=relays`}>Configure relays</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 3: Delete the now-unused CSS file**

```bash
rm tankctl-web/src/routes/Settings.css
```

- [ ] **Step 4: Verify in browser**

Confirm: submitting an empty device ID shows the zod validation message inline instead of relying on the native `required` attribute; submitting an invalid character (e.g. a space) shows the regex message; a valid submit registers the device, shows the one-time secret box, and resets the field; the devices list still links to each device's relay tab.

- [ ] **Step 5: Commit**

```bash
git add tankctl-web/src/routes/Settings.tsx tankctl-web/package.json tankctl-web/package-lock.json
git rm tankctl-web/src/routes/Settings.css
git commit -m "feat: convert Settings register-device form to react-hook-form+zod, reskin"
```

---

### Task 17: TankDetail.tsx reskin

**Files:**
- Modify: `tankctl-web/src/routes/TankDetail.tsx`
- Delete: `tankctl-web/src/routes/TankDetail.css`

**Interfaces:**
- Consumes: `StatusPill` (Task 5), `StatTile` (Task 7), `LineChart` (Task 11), `Tabs` (Task 9), `EmptyState` (Task 6), `Button` (range picker), unchanged `useTankTelemetry` hook.

- [ ] **Step 1: Rewrite TankDetail.tsx**

```tsx
import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useDeviceDetail } from '../api/devices'
import { StatusPill, type PillTone } from '../components/StatusPill'
import { StatTile } from '../components/StatTile'
import { LineChart } from '../components/LineChart'
import { Tabs } from '../components/Tabs'
import { EmptyState } from '../components/EmptyState'
import { Button } from '../components/ui/button'
import { useTankTelemetry } from '../features/tank-detail/useTankTelemetry'
import type { ChartRange } from '../api/telemetry'
import { LightTab } from '../features/tank-detail/LightTab'
import { RelaysTab } from '../features/tank-detail/RelaysTab'
import { WaterTab } from '../features/tank-detail/WaterTab'
import { CommandsTab } from '../features/tank-detail/CommandsTab'
import { IconCommands, IconLight, IconRelay, IconWater } from '../components/icons'

const TABS = [
  { id: 'light', label: 'Light', Icon: IconLight },
  { id: 'relays', label: 'Relays', Icon: IconRelay },
  { id: 'water', label: 'Water', Icon: IconWater },
  { id: 'commands', label: 'Commands', Icon: IconCommands },
]

const LAST_TAB_KEY = 'tankctl:last-detail-tab'

function useRelativeTime(iso: string | null | undefined) {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [])
  if (!iso) return null
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  return `${Math.floor(seconds / 3600)}h ago`
}

function statusTone(status: string): PillTone {
  if (status === 'online') return 'ok'
  if (status === 'time_unknown') return 'warn'
  return 'danger'
}

export function TankDetail() {
  const { deviceId } = useParams<{ deviceId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const [range, setRange] = useState<ChartRange>('live')

  const { data: device, isLoading, isError } = useDeviceDetail(deviceId ?? '')
  const telemetry = useTankTelemetry(deviceId ?? '', range)
  const relativeLastSeen = useRelativeTime(device?.last_seen)

  const activeTab = searchParams.get('tab') ?? window.localStorage.getItem(LAST_TAB_KEY) ?? 'light'

  function handleTabChange(id: string) {
    window.localStorage.setItem(LAST_TAB_KEY, id)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', id)
      return next
    })
  }

  if (!deviceId) return null
  if (isLoading) return <p className="text-sm text-muted-foreground">Loading tank…</p>
  if (isError || !device) {
    return (
      <EmptyState
        title="Tank not found"
        description={`No device with id "${deviceId}".`}
        action={
          <Button asChild variant="outline">
            <Link to="/">Back to Overview</Link>
          </Button>
        }
      />
    )
  }

  const lastTemp = telemetry.temp.at(-1)
  const lastHumidity = telemetry.humidity.at(-1)

  return (
    <div>
      <div className="hud-frame mb-4 rounded-lg border bg-card">
        <header className="flex items-start justify-between gap-4">
          <div>
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
              ← Overview
            </Link>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">{device.device_name ?? device.device_id}</h1>
          </div>
          <div className="flex items-center gap-3">
            {relativeLastSeen && <span className="font-mono text-xs text-muted-foreground">Updated {relativeLastSeen}</span>}
            <StatusPill tone={statusTone(device.status)} />
          </div>
        </header>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <StatTile label="Water temperature" value={lastTemp ? lastTemp.value.toFixed(1) : '—'} unit="°C" />
          <StatTile label="Humidity" value={lastHumidity ? lastHumidity.value.toFixed(1) : '—'} unit="%" />
          <StatTile label="Last seen" value={device.last_seen ? new Date(device.last_seen).toLocaleTimeString() : '—'} />
        </div>
      </div>

      {telemetry.stale && range === 'live' && (
        <div role="status" className="mb-4 rounded-md border border-[var(--warn)] bg-[var(--warn-fill)] px-3 py-2 text-sm">
          Live feed degraded — showing last known reading and polling every 15s.
        </div>
      )}

      <div className="mb-4 flex gap-1 rounded-md border bg-muted p-1" role="group" aria-label="Time range">
        {(['live', '7d', '30d'] as ChartRange[]).map((r) => (
          <Button
            key={r}
            type="button"
            variant={range === r ? 'default' : 'ghost'}
            size="sm"
            aria-pressed={range === r}
            onClick={() => setRange(r)}
          >
            {r === 'live' ? 'Live' : r}
          </Button>
        ))}
      </div>

      <div className="mb-4 rounded-lg border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold">Water temperature</h3>
        {telemetry.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading chart…</p>
        ) : (
          <LineChart
            data={telemetry.temp}
            unit="°C"
            color="var(--series-temp)"
            fillColor="var(--series-temp-fill)"
            stale={telemetry.stale}
            dayTicks={telemetry.dayTicks}
            ariaLabel="Water temperature over time"
          />
        )}
      </div>

      <div className="mb-4 rounded-lg border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold">Humidity</h3>
        {telemetry.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading chart…</p>
        ) : (
          <LineChart
            data={telemetry.humidity}
            unit="%"
            color="var(--series-humid)"
            fillColor="var(--series-humid-fill)"
            stale={telemetry.stale}
            dayTicks={telemetry.dayTicks}
            ariaLabel="Humidity over time"
          />
        )}
      </div>

      <div>
        <Tabs tabs={TABS} activeId={activeTab} onChange={handleTabChange} />
        <div className="mt-4">
          {activeTab === 'light' && <LightTab key={deviceId} deviceId={deviceId} lightSchedule={device.light_schedule} />}
          {activeTab === 'relays' && <RelaysTab key={deviceId} deviceId={deviceId} />}
          {activeTab === 'water' && <WaterTab key={deviceId} deviceId={deviceId} />}
          {activeTab === 'commands' && <CommandsTab key={deviceId} deviceId={deviceId} />}
        </div>
      </div>
    </div>
  )
}
```

Note `.hud-frame` (the corner-bracket motif, `index.css`) is kept as-is per the spec's decision to preserve non-shadcn tokens/motifs — only the surrounding classes moved to Tailwind.

- [ ] **Step 2: Delete the now-unused CSS file**

```bash
rm tankctl-web/src/routes/TankDetail.css
```

- [ ] **Step 3: Verify in browser**

Confirm the header, stat tiles, stale banner (force it by throttling network in devtools), range picker, both charts, and tab panel all render correctly; range picker's active button now uses the `default` Button variant so it's visually distinct.

- [ ] **Step 4: Commit**

```bash
git add tankctl-web/src/routes/TankDetail.tsx
git rm tankctl-web/src/routes/TankDetail.css
git commit -m "refactor: reskin TankDetail with Tailwind"
```

---

### Task 18: CommandsTab.tsx reskin

**Files:**
- Modify: `tankctl-web/src/features/tank-detail/CommandsTab.tsx`

**Interfaces:**
- Consumes: `Table` family from `../../components/ui/table`, `Badge` for status.

- [ ] **Step 1: Rewrite CommandsTab.tsx**

```tsx
import { useCommandHistory } from '../../api/commands'
import { EmptyState } from '../../components/EmptyState'
import { Badge } from '../../components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table'

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  sent: 'Sent',
  executed: 'Executed',
  failed: 'Failed',
  timeout: 'Timed out',
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline',
  sent: 'secondary',
  executed: 'default',
  failed: 'destructive',
  timeout: 'destructive',
}

export function CommandsTab({ deviceId }: { deviceId: string }) {
  const { data, isLoading } = useCommandHistory(deviceId, 50)

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading command history…</p>
  if (!data || data.commands.length === 0) {
    return <EmptyState title="No commands sent yet" description="Commands sent from Light/Relays tabs will show up here." />
  }

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Command</TableHead>
            <TableHead>Value</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.commands.map((c) => (
            <TableRow key={c.command_id ?? `${c.command}-${c.version}`}>
              <TableCell className="font-mono">{c.created_at ? new Date(c.created_at).toLocaleString() : '—'}</TableCell>
              <TableCell>{c.command}</TableCell>
              <TableCell className="font-mono">{c.value ?? '—'}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[c.status] ?? 'outline'}>{STATUS_LABEL[c.status] ?? c.status}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Open the Commands tab on a device with history, confirm the table renders with status badges colored per status.

- [ ] **Step 3: Commit**

```bash
git add tankctl-web/src/features/tank-detail/CommandsTab.tsx
git commit -m "refactor: rebuild CommandsTab on shadcn Table/Badge"
```

---

### Task 19: LightTab.tsx — react-hook-form + toast conversion + reskin

**Files:**
- Modify: `tankctl-web/src/features/tank-detail/LightTab.tsx`

**Interfaces:**
- Consumes: `Form` family, `Input`, `Button`, `toast` from `sonner`.

- [ ] **Step 1: Rewrite LightTab.tsx**

```tsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import type { LightSchedule } from '../../api/types'
import { useSetLight } from '../../api/commands'
import { useSaveLightSchedule, useDeleteLightSchedule } from '../../api/lightSchedule'
import { Button } from '../../components/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../../components/ui/form'
import { Input } from '../../components/ui/input'

const lightScheduleSchema = z.object({
  on_time: z.string().min(1, 'On time is required'),
  off_time: z.string().min(1, 'Off time is required'),
  enabled: z.boolean(),
})

/** Mounted with `key={deviceId}` by TankDetail, so switching tanks remounts
 * this component fresh rather than needing an effect to resync form state. */
export function LightTab({ deviceId, lightSchedule }: { deviceId: string; lightSchedule: LightSchedule | null }) {
  const setLight = useSetLight(deviceId)
  const saveSchedule = useSaveLightSchedule(deviceId)
  const deleteSchedule = useDeleteLightSchedule(deviceId)

  const form = useForm<z.infer<typeof lightScheduleSchema>>({
    resolver: zodResolver(lightScheduleSchema),
    defaultValues: {
      on_time: lightSchedule?.on_time ?? '06:00',
      off_time: lightSchedule?.off_time ?? '18:00',
      enabled: lightSchedule?.enabled ?? true,
    },
  })

  function handleSetLight(state: 'on' | 'off') {
    setLight.mutate(state, {
      onSuccess: () => toast.success(`Light turned ${state}`),
      onError: () => toast.error('Failed to set light'),
    })
  }

  function onSubmit(values: z.infer<typeof lightScheduleSchema>) {
    saveSchedule.mutate(values, {
      onSuccess: () => toast.success('Light schedule saved'),
      onError: () => toast.error('Failed to save schedule'),
    })
  }

  function handleDeleteSchedule() {
    deleteSchedule.mutate(undefined, {
      onSuccess: () => toast.success('Light schedule deleted'),
      onError: () => toast.error('Failed to delete schedule'),
    })
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-card p-5">
        <h3 className="mb-3 font-semibold">Manual override</h3>
        <div className="flex gap-2">
          <Button type="button" onClick={() => handleSetLight('on')} disabled={setLight.isPending}>
            Turn on
          </Button>
          <Button type="button" variant="outline" onClick={() => handleSetLight('off')} disabled={setLight.isPending}>
            Turn off
          </Button>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-5">
        <h3 className="mb-4 font-semibold">Schedule</h3>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="on_time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>On time</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="off_time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Off time</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2 space-y-0">
                  <FormControl>
                    <input type="checkbox" checked={field.value} onChange={(e) => field.onChange(e.target.checked)} className="h-4 w-4" />
                  </FormControl>
                  <FormLabel className="!mt-0">Enabled</FormLabel>
                </FormItem>
              )}
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={saveSchedule.isPending}>
                Save schedule
              </Button>
              {lightSchedule && (
                <Button type="button" variant="destructive" onClick={handleDeleteSchedule} disabled={deleteSchedule.isPending}>
                  Delete schedule
                </Button>
              )}
            </div>
          </form>
        </Form>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Confirm manual on/off still works with toasts, the schedule form loads existing values, saves, and deletes correctly, and clearing a time field shows the zod required-message instead of only relying on the native `required` attribute.

- [ ] **Step 3: Commit**

```bash
git add tankctl-web/src/features/tank-detail/LightTab.tsx
git commit -m "feat: convert LightTab schedule form to react-hook-form+zod, sonner toasts, reskin"
```

---

### Task 20: RelaysTab.tsx — react-hook-form + toast conversion + reskin

**Files:**
- Modify: `tankctl-web/src/features/tank-detail/RelaysTab.tsx`

**Interfaces:**
- Consumes: `Form` family, `Input`, `Select`, `Button`, `toast` from `sonner`, `EmptyState` (unchanged).

- [ ] **Step 1: Rewrite RelaysTab.tsx**

```tsx
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import type { RelayConfig, RelayConfigWrite } from '../../api/types'
import { useCreateRelay, useDeleteRelay, usePushRelayConfig, useRelays, useUpdateRelay } from '../../api/relays'
import { useSetDesiredState, useShadow } from '../../api/shadow'
import { EmptyState } from '../../components/EmptyState'
import { Button } from '../../components/ui/button'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '../../components/ui/form'
import { Input } from '../../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'

const relaySchema = z.object({
  relay_name: z.string().min(1, 'Relay name is required'),
  gpio_pin: z.coerce.number().int().min(0).max(39),
  active_level: z.enum(['LOW', 'HIGH']),
  default_state: z.enum(['on', 'off']),
  fail_safe_default: z.enum(['on', 'off']),
  cutoff_ceiling_seconds: z.coerce.number().int().positive().nullable(),
})

type RelayFormValues = z.infer<typeof relaySchema>

const EMPTY_FORM: RelayConfigWrite = {
  relay_name: '',
  gpio_pin: 0,
  active_level: 'LOW',
  default_state: 'off',
  fail_safe_default: 'off',
  cutoff_ceiling_seconds: null,
}

function RelayForm({
  initial,
  lockName,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial: RelayConfigWrite
  lockName: boolean
  onSubmit: (body: RelayConfigWrite) => void
  onCancel: () => void
  submitting: boolean
}) {
  const form = useForm<RelayFormValues>({
    resolver: zodResolver(relaySchema),
    defaultValues: initial,
  })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 rounded-lg border bg-muted/40 p-5">
        <FormField
          control={form.control}
          name="relay_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Relay name</FormLabel>
              <FormControl>
                <Input {...field} disabled={lockName} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="gpio_pin"
          render={({ field }) => (
            <FormItem>
              <FormLabel>GPIO pin</FormLabel>
              <FormControl>
                <Input type="number" min={0} max={39} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="active_level"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Active level</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="LOW">LOW</SelectItem>
                  <SelectItem value="HIGH">HIGH</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="default_state"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Default state (on boot)</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="off">off</SelectItem>
                  <SelectItem value="on">on</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="fail_safe_default"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fail-safe default</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="off">off</SelectItem>
                  <SelectItem value="on">on</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>State forced when the device can't trust its network/time.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="cutoff_ceiling_seconds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cutoff ceiling (seconds, blank = no ceiling)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={submitting}>
            Save relay
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  )
}

export function RelaysTab({ deviceId }: { deviceId: string }) {
  const { data: relayConfig, isLoading } = useRelays(deviceId)
  const { data: shadow } = useShadow(deviceId)
  const createRelay = useCreateRelay(deviceId)
  const updateRelay = useUpdateRelay(deviceId)
  const deleteRelay = useDeleteRelay(deviceId)
  const pushConfig = usePushRelayConfig(deviceId)
  const setDesired = useSetDesiredState(deviceId)

  const [adding, setAdding] = useState(false)
  const [editingName, setEditingName] = useState<string | null>(null)

  const relays: [string, RelayConfig][] = relayConfig ? Object.entries(relayConfig.relays) : []

  function toggleRelay(name: string, state: 'on' | 'off') {
    setDesired.mutate(
      { [name]: state },
      {
        onSuccess: () => toast.success(`${name} set to ${state}`),
        onError: () => toast.error(`Failed to set ${name}`),
      },
    )
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading relays…</p>

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button type="button" onClick={() => setAdding(true)}>
          Add relay
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pushConfig.isPending}
          onClick={() =>
            pushConfig.mutate(undefined, {
              onSuccess: () => toast.success('Relay config pushed to device'),
              onError: () => toast.error('Failed to push config'),
            })
          }
        >
          Push config to device
        </Button>
      </div>

      {adding && (
        <RelayForm
          initial={EMPTY_FORM}
          lockName={false}
          submitting={createRelay.isPending}
          onCancel={() => setAdding(false)}
          onSubmit={(body) =>
            createRelay.mutate(body, {
              onSuccess: () => {
                toast.success('Relay created')
                setAdding(false)
              },
              onError: () => toast.error('Failed to create relay'),
            })
          }
        />
      )}

      {relays.length === 0 && !adding ? (
        <EmptyState title="No relays configured" description="Add a relay to control it from here." />
      ) : (
        <div className="divide-y rounded-lg border bg-card">
          {relays.map(([name, relay]) =>
            editingName === name ? (
              <div key={name} className="p-4">
                <RelayForm
                  initial={{ ...relay, relay_name: name }}
                  lockName
                  submitting={updateRelay.isPending}
                  onCancel={() => setEditingName(null)}
                  onSubmit={(body) =>
                    updateRelay.mutate(
                      { relayName: name, body },
                      {
                        onSuccess: () => {
                          toast.success('Relay updated')
                          setEditingName(null)
                        },
                        onError: () => toast.error('Failed to update relay'),
                      },
                    )
                  }
                />
              </div>
            ) : (
              <div key={name} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    GPIO {relay.gpio_pin} · reported: {shadow?.reported[name] ?? 'unknown'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => toggleRelay(name, 'on')} disabled={setDesired.isPending}>
                    On
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => toggleRelay(name, 'off')} disabled={setDesired.isPending}>
                    Off
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditingName(name)}>
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() =>
                      deleteRelay.mutate(name, {
                        onSuccess: () => toast.success('Relay deleted'),
                        onError: () => toast.error('Failed to delete relay'),
                      })
                    }
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Confirm add/edit/delete relay all work through the new form, GPIO pin out of 0–39 shows a zod error, on/off/push-config toasts fire.

- [ ] **Step 3: Commit**

```bash
git add tankctl-web/src/features/tank-detail/RelaysTab.tsx
git commit -m "feat: convert RelayForm to react-hook-form+zod, sonner toasts, reskin"
```

---

### Task 21: WaterScheduleForm.tsx — full react-hook-form + zod conversion

**Files:**
- Modify: `tankctl-web/src/features/tank-detail/WaterScheduleForm.tsx`

**Interfaces:**
- Consumes: `Form` family, `Input`, `Textarea`, `Button`.
- Produces: same external API — `WaterScheduleForm({ initial, submitting, onSubmit, onCancel })`, same `WaterScheduleWrite` shape submitted.

- [ ] **Step 1: Rewrite WaterScheduleForm.tsx**

```tsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { WaterScheduleWrite } from '../../api/types'
import { Button } from '../../components/ui/button'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '../../components/ui/form'
import { Input } from '../../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { Textarea } from '../../components/ui/textarea'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const waterScheduleSchema = z
  .object({
    schedule_type: z.enum(['weekly', 'custom', 'interval']),
    days_of_week: z.array(z.number().int().min(0).max(6)),
    schedule_date: z.string().nullable(),
    interval_days: z.coerce.number().int().positive().nullable(),
    schedule_time: z.string().min(1, 'Time is required'),
    notes: z.string().nullable(),
    completed: z.boolean(),
    enabled: z.boolean(),
    notify_24h: z.boolean(),
    notify_1h: z.boolean(),
    notify_on_time: z.boolean(),
    ph: z.coerce.number().nullable(),
    ammonia: z.coerce.number().nullable(),
    nitrite: z.coerce.number().nullable(),
    nitrate: z.coerce.number().nullable(),
    tds: z.coerce.number().nullable(),
  })
  .refine((v) => v.schedule_type !== 'custom' || Boolean(v.schedule_date), {
    message: 'Date is required',
    path: ['schedule_date'],
  })
  .refine((v) => v.schedule_type !== 'interval' || (v.interval_days !== null && v.interval_days > 0), {
    message: 'Interval is required',
    path: ['interval_days'],
  })

type WaterScheduleFormValues = z.infer<typeof waterScheduleSchema>

export function WaterScheduleForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
}: {
  initial: WaterScheduleWrite
  submitting: boolean
  onSubmit: (body: WaterScheduleWrite) => void
  onCancel: () => void
}) {
  const form = useForm<WaterScheduleFormValues>({
    resolver: zodResolver(waterScheduleSchema),
    defaultValues: initial,
  })

  const scheduleType = form.watch('schedule_type')
  const daysOfWeek = form.watch('days_of_week') ?? []
  const completed = form.watch('completed')

  function toggleWeekday(day: number) {
    const next = daysOfWeek.includes(day) ? daysOfWeek.filter((d) => d !== day) : [...daysOfWeek, day].sort()
    form.setValue('days_of_week', next)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => onSubmit(values as WaterScheduleWrite))} className="space-y-4 rounded-lg border bg-muted/40 p-5">
        <FormField
          control={form.control}
          name="schedule_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cadence</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="weekly">Weekly (recurring)</SelectItem>
                  <SelectItem value="custom">One-off date</SelectItem>
                  <SelectItem value="interval">Every N days</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />

        {scheduleType === 'weekly' && (
          <FormItem>
            <FormLabel>Days of week</FormLabel>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_LABELS.map((label, day) => (
                <Button
                  key={day}
                  type="button"
                  variant={daysOfWeek.includes(day) ? 'default' : 'outline'}
                  size="sm"
                  aria-pressed={daysOfWeek.includes(day)}
                  onClick={() => toggleWeekday(day)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </FormItem>
        )}

        {scheduleType === 'custom' && (
          <FormField
            control={form.control}
            name="schedule_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date</FormLabel>
                <FormControl>
                  <Input type="date" value={field.value ?? ''} onChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {scheduleType === 'interval' && (
          <FormField
            control={form.control}
            name="interval_days"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Every N days</FormLabel>
                <FormControl>
                  <Input type="number" min={1} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="schedule_time"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Time</FormLabel>
              <FormControl>
                <Input type="time" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea rows={2} value={field.value ?? ''} onChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="enabled"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-2 space-y-0">
              <FormControl>
                <input type="checkbox" checked={field.value} onChange={(e) => field.onChange(e.target.checked)} className="h-4 w-4" />
              </FormControl>
              <FormLabel className="!mt-0">Reminders enabled</FormLabel>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="completed"
          render={({ field }) => (
            <FormItem>
              <div className="flex flex-row items-center gap-2">
                <FormControl>
                  <input type="checkbox" checked={field.value} onChange={(e) => field.onChange(e.target.checked)} className="h-4 w-4" />
                </FormControl>
                <FormLabel className="!mt-0">Completed</FormLabel>
              </div>
              <FormDescription>Check this once the water change has actually happened.</FormDescription>
            </FormItem>
          )}
        />

        {completed && (
          <>
            <p className="text-sm text-muted-foreground">Water-quality readings (optional)</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {(['ph', 'ammonia', 'nitrite', 'nitrate', 'tds'] as const).map((key) => (
                <FormField
                  key={key}
                  control={form.control}
                  name={key}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="capitalize">{key === 'ph' ? 'pH' : key === 'tds' ? 'TDS' : key}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step={key === 'ammonia' || key === 'nitrite' ? '0.01' : key === 'tds' ? '1' : '0.1'}
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              ))}
            </div>
          </>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={submitting}>
            Save
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  )
}
```

- [ ] **Step 2: Verify in browser**

On the Water tab, confirm: switching cadence shows/hides the right field, submitting a `custom` schedule with no date shows the zod "Date is required" message, submitting `interval` with no value shows "Interval is required", checking "Completed" reveals the readings grid, save/cancel both work for add/edit/log-now flows.

- [ ] **Step 3: Commit**

```bash
git add tankctl-web/src/features/tank-detail/WaterScheduleForm.tsx
git commit -m "feat: convert WaterScheduleForm to react-hook-form+zod"
```

---

### Task 22: WaterTab.tsx — toast conversion + reskin

**Files:**
- Modify: `tankctl-web/src/features/tank-detail/WaterTab.tsx`

**Interfaces:**
- Consumes: `WaterScheduleForm` (Task 21, unchanged props), `WaterHistoryCalendar` (Task 23 rewrites this — this task's own changes don't touch the calendar's internals, just how it's mounted), `Button`, `toast` from `sonner`.

- [ ] **Step 1: Rewrite WaterTab.tsx**

```tsx
import { useState } from 'react'
import { toast } from 'sonner'
import type { WaterSchedule, WaterScheduleWrite } from '../../api/types'
import { useCreateWaterSchedule, useDeleteWaterSchedule, useUpdateWaterSchedule, useWaterSchedules } from '../../api/waterSchedules'
import { WaterScheduleForm } from './WaterScheduleForm'
import { WaterHistoryCalendar } from './WaterHistoryCalendar'
import { EmptyState } from '../../components/EmptyState'
import { Button } from '../../components/ui/button'
import { toLocalDateKey } from '../../lib/date'

const BLANK: WaterScheduleWrite = {
  schedule_type: 'weekly',
  days_of_week: [],
  schedule_date: null,
  interval_days: null,
  schedule_time: '12:00',
  notes: null,
  completed: false,
  enabled: true,
  notify_24h: true,
  notify_1h: true,
  notify_on_time: true,
  ph: null,
  ammonia: null,
  nitrite: null,
  nitrate: null,
  tds: null,
}

function toWrite(s: WaterSchedule): WaterScheduleWrite {
  const { id: _id, device_id: _deviceId, created_at: _createdAt, updated_at: _updatedAt, ...rest } = s
  return rest
}

function cadenceLabel(s: WaterSchedule): string {
  if (s.schedule_type === 'custom') return s.schedule_date ?? 'one-off'
  if (s.schedule_type === 'interval') return `every ${s.interval_days} days`
  const days = (s.days_of_week ?? []).map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')
  return `weekly · ${days || '—'}`
}

export function WaterTab({ deviceId }: { deviceId: string }) {
  const { data: schedules, isLoading } = useWaterSchedules(deviceId)
  const createSchedule = useCreateWaterSchedule(deviceId)
  const updateSchedule = useUpdateWaterSchedule(deviceId)
  const deleteSchedule = useDeleteWaterSchedule(deviceId)

  const [mode, setMode] = useState<'none' | 'add' | 'log-now' | number>('none')

  function closeForm() {
    setMode('none')
  }

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading water schedules…</p>

  const logNowDefaults: WaterScheduleWrite = {
    ...BLANK,
    schedule_type: 'custom',
    schedule_date: toLocalDateKey(new Date()),
    schedule_time: new Date().toTimeString().slice(0, 5),
    completed: true,
    enabled: false,
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button type="button" onClick={() => setMode('add')}>
          Add schedule
        </Button>
        <Button type="button" variant="outline" onClick={() => setMode('log-now')}>
          Log a change now
        </Button>
      </div>

      {mode === 'add' && (
        <WaterScheduleForm
          initial={BLANK}
          submitting={createSchedule.isPending}
          onCancel={closeForm}
          onSubmit={(body) =>
            createSchedule.mutate(body, {
              onSuccess: () => {
                toast.success('Water schedule created')
                closeForm()
              },
              onError: () => toast.error('Failed to create schedule'),
            })
          }
        />
      )}

      {mode === 'log-now' && (
        <WaterScheduleForm
          initial={logNowDefaults}
          submitting={createSchedule.isPending}
          onCancel={closeForm}
          onSubmit={(body) =>
            createSchedule.mutate(body, {
              onSuccess: () => {
                toast.success('Water change logged')
                closeForm()
              },
              onError: () => toast.error('Failed to log water change'),
            })
          }
        />
      )}

      {!schedules || schedules.length === 0 ? (
        <EmptyState title="No water schedules yet" description="Add a recurring schedule or log a change that just happened." />
      ) : (
        <div className="divide-y rounded-lg border bg-card">
          {schedules.map((s) =>
            mode === s.id ? (
              <div key={s.id} className="p-4">
                <WaterScheduleForm
                  initial={toWrite(s)}
                  submitting={updateSchedule.isPending}
                  onCancel={closeForm}
                  onSubmit={(body) =>
                    updateSchedule.mutate(
                      { scheduleId: s.id, body },
                      {
                        onSuccess: () => {
                          toast.success('Water schedule updated')
                          closeForm()
                        },
                        onError: () => toast.error('Failed to update schedule'),
                      },
                    )
                  }
                />
              </div>
            ) : (
              <div key={s.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{cadenceLabel(s)}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {s.schedule_time} · {s.completed ? 'completed' : s.enabled ? 'active' : 'disabled'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setMode(s.id)}>
                    {s.completed ? 'Edit' : 'Mark complete / edit'}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() =>
                      deleteSchedule.mutate(s.id, {
                        onSuccess: () => toast.success('Schedule deleted'),
                        onError: () => toast.error('Failed to delete schedule'),
                      })
                    }
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ),
          )}
        </div>
      )}

      <div className="rounded-lg border bg-card p-5">
        <h3 className="mb-3 font-semibold">History</h3>
        <WaterHistoryCalendar schedules={schedules ?? []} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Confirm add/log-now/edit/delete all work with sonner toasts, list rows render correctly.

- [ ] **Step 3: Commit**

```bash
git add tankctl-web/src/features/tank-detail/WaterTab.tsx
git commit -m "refactor: reskin WaterTab, convert to sonner toasts"
```

---

### Task 23: WaterHistoryCalendar.tsx — rebuild on shadcn Calendar with logged + scheduled markers

**Files:**
- Modify: `tankctl-web/src/features/tank-detail/WaterHistoryCalendar.tsx`
- Delete: `tankctl-web/src/features/tank-detail/WaterHistoryCalendar.css`

**Interfaces:**
- Consumes: `Calendar` from `../../components/ui/calendar` (react-day-picker), `toLocalDateKey` from `../../lib/date` (existing, unchanged).
- Produces: same external API — `WaterHistoryCalendar({ schedules: WaterSchedule[] })`.

- [ ] **Step 1: Rewrite WaterHistoryCalendar.tsx**

```tsx
import { useMemo, useState } from 'react'
import { Calendar } from '../../components/ui/calendar'
import type { WaterSchedule } from '../../api/types'
import { toLocalDateKey } from '../../lib/date'

function cadenceLabel(s: WaterSchedule): string {
  if (s.schedule_type === 'custom') return s.schedule_date ?? 'one-off'
  if (s.schedule_type === 'interval') return `every ${s.interval_days} days`
  const days = (s.days_of_week ?? []).map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')
  return `weekly · ${days || '—'}`
}

/** History covers completed one-off entries (logged) AND upcoming
 * enabled/uncompleted schedules (scheduled) — a completed weekly/interval
 * row is a recurring rule, not a dated historical event (see spec/PRODUCT.md),
 * so only its *upcoming* occurrences appear as "scheduled", never "logged". */
export function WaterHistoryCalendar({ schedules }: { schedules: WaterSchedule[] }) {
  const [month, setMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | undefined>()

  const completedByDate = useMemo(() => {
    const map = new Map<string, WaterSchedule[]>()
    for (const s of schedules) {
      if (s.schedule_type === 'custom' && s.completed && s.schedule_date) {
        const list = map.get(s.schedule_date) ?? []
        list.push(s)
        map.set(s.schedule_date, list)
      }
    }
    return map
  }, [schedules])

  const scheduledByDate = useMemo(() => {
    const map = new Map<string, WaterSchedule[]>()
    const add = (key: string, s: WaterSchedule) => {
      const list = map.get(key) ?? []
      list.push(s)
      map.set(key, list)
    }
    const monthStart = new Date(month.getFullYear(), month.getMonth(), 1)
    const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0)
    for (const s of schedules) {
      if (!s.enabled || s.completed) continue
      if (s.schedule_type === 'custom' && s.schedule_date) {
        add(s.schedule_date, s)
      } else if (s.schedule_type === 'weekly' && s.days_of_week) {
        for (const d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
          if (s.days_of_week.includes(d.getDay())) add(toLocalDateKey(d), s)
        }
      } else if (s.schedule_type === 'interval' && s.interval_days && s.created_at) {
        const anchor = new Date(s.created_at)
        for (const d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
          const diffDays = Math.round((d.getTime() - anchor.getTime()) / 86_400_000)
          if (diffDays >= 0 && diffDays % s.interval_days === 0) add(toLocalDateKey(d), s)
        }
      }
    }
    return map
  }, [schedules, month])

  const loggedDates = useMemo(
    () => [...completedByDate.keys()].map((k) => new Date(`${k}T00:00:00`)),
    [completedByDate],
  )
  const scheduledDates = useMemo(
    () => [...scheduledByDate.keys()].map((k) => new Date(`${k}T00:00:00`)),
    [scheduledByDate],
  )

  const selectedKey = selectedDate ? toLocalDateKey(selectedDate) : null
  const loggedEntries = selectedKey ? (completedByDate.get(selectedKey) ?? []) : []
  const scheduledEntries = selectedKey ? (scheduledByDate.get(selectedKey) ?? []) : []

  return (
    <div className="flex flex-col items-center gap-3">
      <Calendar
        mode="single"
        month={month}
        onMonthChange={setMonth}
        selected={selectedDate}
        onSelect={setSelectedDate}
        modifiers={{ logged: loggedDates, scheduled: scheduledDates }}
        modifiersClassNames={{
          logged:
            "relative after:absolute after:bottom-0.5 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-primary after:content-['']",
          scheduled:
            "relative before:absolute before:top-0.5 before:left-1/2 before:h-1 before:w-1 before:-translate-x-1/2 before:rounded-full before:border before:border-[var(--warn)] before:content-['']",
        }}
        className="max-w-[280px] rounded-md border p-2"
      />
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Logged
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full border border-[var(--warn)]" /> Scheduled
        </span>
      </div>
      {(loggedEntries.length > 0 || scheduledEntries.length > 0) && (
        <div className="w-full space-y-3 border-t pt-3 text-sm">
          {loggedEntries.map((entry) => (
            <div key={entry.id}>
              <p className="font-mono font-medium">{entry.schedule_date}</p>
              {entry.notes && <p>{entry.notes}</p>}
              <p className="font-mono text-xs text-muted-foreground">
                {[
                  entry.ph !== null && `pH ${entry.ph}`,
                  entry.ammonia !== null && `NH3 ${entry.ammonia}`,
                  entry.nitrite !== null && `NO2 ${entry.nitrite}`,
                  entry.nitrate !== null && `NO3 ${entry.nitrate}`,
                  entry.tds !== null && `TDS ${entry.tds}`,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'No readings recorded'}
              </p>
            </div>
          ))}
          {scheduledEntries.map((s) => (
            <div key={s.id}>
              <p className="font-medium">{cadenceLabel(s)}</p>
              <p className="font-mono text-xs text-muted-foreground">{s.schedule_time}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Delete the now-unused CSS file**

```bash
rm tankctl-web/src/features/tank-detail/WaterHistoryCalendar.css
```

- [ ] **Step 3: Verify in browser**

On the Water tab: confirm the calendar is compact (max 280px, no longer stretching full card width), a completed one-off entry shows a filled dot, an enabled weekly/interval/custom schedule shows an outlined dot on every date it occurs in the visible month, a date with both shows both dots, clicking a logged date shows readings, clicking a scheduled-only date shows cadence + time, and month navigation recomputes the scheduled markers for the new month.

- [ ] **Step 4: Commit**

```bash
git add tankctl-web/src/features/tank-detail/WaterHistoryCalendar.tsx
git rm tankctl-web/src/features/tank-detail/WaterHistoryCalendar.css
git commit -m "feat: rebuild water history calendar on shadcn Calendar with logged/scheduled markers"
```

---

### Task 24: Cleanup — delete remaining unused CSS, verify no dangling imports

**Files:**
- Delete: `tankctl-web/src/features/tank-detail/tab-panels.css`
- Delete: `tankctl-web/src/styles/ui.css`
- Modify: `tankctl-web/src/index.css` (remove the `@import './styles/ui.css';` line)

**Interfaces:**
- None — this is pure removal, no new code.

- [ ] **Step 1: Search for any remaining `.css` imports outside index.css/tokens.css**

Run: `grep -rn "\.css'" tankctl-web/src --include=*.tsx --include=*.ts`
Expected: no results (every component-level `.css` import should already be gone from Tasks 4–23; `tab-panels.css` and `ui.css` are the last two, imported nowhere by this point except `index.css`'s `ui.css` line).

If the grep finds anything else, that file was missed in an earlier task — go back and finish that task's reskin rather than deleting the CSS file out from under it.

- [ ] **Step 2: Remove the ui.css import and delete both remaining CSS files**

`tankctl-web/src/index.css` — remove this line:

```css
@import './styles/ui.css';
```

```bash
rm tankctl-web/src/features/tank-detail/tab-panels.css tankctl-web/src/styles/ui.css
```

- [ ] **Step 3: Full build + smoke check**

Run: `npm run build` (from `tankctl-web/`)
Expected: clean build, no missing-module errors, no unused-import lint errors (`npm run lint`).
Run: `npm run dev`, click through every route once — Overview, a Tank Detail (all four tabs), Alerts, Settings — confirm nothing renders unstyled (a plain unstyled block usually means a missed class name from a deleted CSS file).

- [ ] **Step 4: Commit**

```bash
git add tankctl-web/src/index.css
git rm tankctl-web/src/features/tank-detail/tab-panels.css tankctl-web/src/styles/ui.css
git commit -m "chore: remove remaining pre-shadcn CSS files"
```

---

### Task 25: Update docs/ui/01_spec.md

**Files:**
- Modify: `docs/ui/01_spec.md`

**Interfaces:**
- None.

- [ ] **Step 1: Update the Components and Theming lines**

In `docs/ui/01_spec.md`, replace line 114 (currently: `- **Components**: no third-party component library, no Storybook. Charts are hand-rolled inline SVG (one shape, reused for every metric) — no charting library dependency.`) with:

```markdown
- **Components**: shadcn/ui (Tailwind v4 + Radix primitives) as of the 2026-08-30 migration — see `docs/superpowers/specs/2026-08-30-shadcn-migration-design.md`. Charts remain hand-rolled inline SVG (one shape, reused for every metric); no charting library dependency.
```

And update line 112 (currently: `- **Theming**: light mode default; dark mode supported (not optional — status colors and chart series need distinct light/dark values, which must be designed together, not patched in later).`) — this line is now accurate again as of the same migration; leave its wording as-is but add a trailing note:

```markdown
- **Theming**: light mode default; dark mode supported (not optional — status colors and chart series need distinct light/dark values, which must be designed together, not patched in later). Implemented via shadcn CSS variables + `next-themes` as of the 2026-08-30 migration.
```

- [ ] **Step 2: Verify**

Read the diff, confirm both lines read correctly in context and no other line references the removed "no third-party component library" constraint.

- [ ] **Step 3: Commit**

```bash
git add docs/ui/01_spec.md
git commit -m "docs: record shadcn/ui + light-mode migration in 01_spec.md"
```

---

### Task 26: Manual QA pass

**Files:** none (verification-only task; fixes for anything found go into the file(s) they belong to, then get their own small commit — this task doesn't pre-declare which files that will be).

**Interfaces:** none.

- [ ] **Step 1: Run the dev server and work through the full spec checklist**

Run: `npm run dev` (from `tankctl-web/`), then in the browser:

- Every route (Overview, Alerts, Settings, Tank Detail) loads and its data renders.
- Every tank-detail tab (Commands, Light, Relays, Water) — every create/edit/delete action, every form validation error path (via zod).
- Water calendar: logged markers, scheduled markers (weekly/interval/custom), combined-marker dates, detail panel for both marker types, month navigation.
- Alerts: event-type labels render correctly for all 8 known types, filter dropdown shows labels not raw strings, acknowledge action still works, an unrecognized event type falls back to the raw string without erroring.
- Toast notifications (success and error paths) fire correctly via sonner.
- LineChart tooltip appears on hover, follows the cursor, matches the below-chart readout's value; the readout row itself still works without hovering.
- Overview cards: sparkline shows a dot per point, latest dot pulses, hovering a dot shows its tooltip, and a live `telemetry_received` event actually moves the line (not just the 60s poll) — confirm by watching a card update without waiting a minute. Block the WebSocket in devtools (Network tab → offline, or block the `/ws` request) and confirm the sparkline still updates within 60s via the polling fallback.
- Theme toggle: light and dark both readable, no flash-of-wrong-theme on reload, `prefers-reduced-motion` (toggle it in devtools' rendering panel) disables the sparkline's pulse and the app's other motion.
- **Spacing/alignment audit**: at both mobile (~375px) and desktop (~1440px) widths, in both themes, check card padding, form field spacing, button groups, and table row height for consistency — shadcn's default spacing scale vs. the rest of the app's remaining hand-rolled bits (`.hud-frame`, `.mono`).

- [ ] **Step 2: Fix anything found**

For each issue found in Step 1, fix it in the file it belongs to (not a new abstraction layer) and re-verify that specific check.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "fix: address findings from shadcn migration QA pass"
```

(Skip this commit if Step 2 found nothing to fix.)
