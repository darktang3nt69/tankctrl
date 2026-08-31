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
