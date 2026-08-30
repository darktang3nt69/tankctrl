import { IconSearch } from './icons'
import './SearchFilterBar.css'

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
    <div className="search-filter-bar">
      <div className="search-filter-bar__search-wrap">
        <IconSearch size={16} />
        <input
          type="search"
          className="search-filter-bar__search"
          placeholder="Search tanks…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search tanks"
        />
      </div>
      <select
        value={statusFilter}
        onChange={(e) => onStatusFilterChange(e.target.value as StatusFilter)}
        aria-label="Filter by status"
      >
        <option value="all">All statuses</option>
        <option value="online">Online</option>
        <option value="offline">Offline</option>
      </select>
      <select value={sortKey} onChange={(e) => onSortKeyChange(e.target.value as SortKey)} aria-label="Sort tanks">
        <option value="name">Sort: name</option>
        <option value="status">Sort: status</option>
        <option value="last-updated">Sort: last updated</option>
      </select>
    </div>
  )
}
