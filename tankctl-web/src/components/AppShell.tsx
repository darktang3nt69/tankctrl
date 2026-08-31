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

  const themeToggle = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      {resolvedTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </Button>
  )
  const statusPill = (
    <StatusPill
      tone={status === 'connected' ? 'ok' : status === 'polling-fallback' ? 'danger' : 'warn'}
      label={status === 'connected' ? 'Live' : status === 'polling-fallback' ? 'Polling' : 'Reconnecting'}
    />
  )
  const brand = (
    <div className="flex items-center gap-2 text-sm font-semibold">
      <span
        aria-hidden="true"
        className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground"
      >
        T
      </span>
      TankCtl
    </div>
  )

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      {/* Mobile top bar (below md breakpoint) */}
      <header className="flex items-center justify-between gap-2 border-b bg-card px-3 py-3 md:hidden">
        {brand}
        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map(({ to, end, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              aria-label={label}
              className={({ isActive }) =>
                `relative flex items-center gap-2 rounded-md p-2 text-sm font-medium transition-colors ${
                  isActive ? 'text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="app-shell-active-nav-mobile"
                      className="absolute inset-0 -z-10 rounded-md bg-accent"
                      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                    />
                  )}
                  <Icon size={18} />
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {statusPill}
          {themeToggle}
        </div>
      </header>
      {/* Desktop sidebar (md and up) */}
      <aside className="hidden w-56 shrink-0 flex-col border-r bg-card px-3 py-4 md:flex">
        <div className="mb-6 px-2">{brand}</div>
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
          {statusPill}
          {themeToggle}
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
