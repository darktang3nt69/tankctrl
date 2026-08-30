import { motion } from 'motion/react'
import type { LucideIcon } from 'lucide-react'
import './Tabs.css'

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
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          type="button"
          aria-selected={tab.id === activeId}
          className={`tabs__tab ${tab.id === activeId ? 'tabs__tab--active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.Icon && <tab.Icon size={14} className="tabs__tab-icon" />}
          {tab.label}
          {tab.id === activeId && (
            <motion.span
              layoutId="tabs-underline"
              className="tabs__underline"
              transition={{ type: 'spring', stiffness: 500, damping: 40 }}
            />
          )}
        </button>
      ))}
    </div>
  )
}
