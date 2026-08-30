import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { useLiveConnectionStatus } from '../ws/LiveEventsProvider'
import { StatusPill } from './StatusPill'
import { IconAlerts, IconOverview, IconSettings } from './icons'
import './AppShell.css'

const NAV_ITEMS = [
  { to: '/', end: true, label: 'Overview', Icon: IconOverview },
  { to: '/alerts', end: false, label: 'Alerts', Icon: IconAlerts },
  { to: '/settings', end: false, label: 'Settings', Icon: IconSettings },
]

export function AppShell() {
  const status = useLiveConnectionStatus()
  const location = useLocation()

  return (
    <div className="app-shell">
      <a href="#main-content" className="visually-hidden app-shell__skip-link">
        Skip to content
      </a>
      <aside className="app-shell__rail">
        <div className="app-shell__brand">
          <span className="app-shell__mark" aria-hidden="true">
            T
          </span>
          TankCtl
        </div>
        <nav className="app-shell__nav">
          {NAV_ITEMS.map(({ to, end, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => (isActive ? 'app-shell__link app-shell__link--active' : 'app-shell__link')}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="app-shell-active-nav"
                      className="app-shell__link-bg"
                      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                    />
                  )}
                  <Icon size={18} className="app-shell__link-icon" />
                  <span className="app-shell__link-label">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="app-shell__foot">
          <StatusPill
            tone={status === 'connected' ? 'ok' : status === 'polling-fallback' ? 'danger' : 'warn'}
            label={
              status === 'connected'
                ? 'Live'
                : status === 'polling-fallback'
                  ? 'Polling'
                  : 'Reconnecting'
            }
          />
        </div>
      </aside>
      <main id="main-content" className="app-shell__main">
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
