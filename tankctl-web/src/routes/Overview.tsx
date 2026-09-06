import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { useDevices } from '../api/devices'
import { useEvents } from '../api/events'
import { TankCard } from '../components/TankCard'
import { SearchFilterBar, type SortKey, type StatusFilter } from '../components/SearchFilterBar'
import { EmptyState } from '../components/EmptyState'
import { RegisterTankModal } from '../components/RegisterTankModal'

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
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Tanks</h1>
        <RegisterTankModal />
      </div>
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
