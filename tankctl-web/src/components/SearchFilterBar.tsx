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
