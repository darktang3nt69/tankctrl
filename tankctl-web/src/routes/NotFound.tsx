import { Link } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'

export function NotFound() {
  return (
    <EmptyState
      title="Page not found"
      action={
        <Link to="/" className="btn">
          Back to Overview
        </Link>
      }
    />
  )
}
