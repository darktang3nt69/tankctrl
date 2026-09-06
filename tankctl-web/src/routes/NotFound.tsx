import { Link } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { Button } from '../components/ui/button'

export function NotFound() {
  return (
    <EmptyState
      title="Page not found"
      action={
        <Button asChild variant="outline">
          <Link to="/">Back to Overview</Link>
        </Button>
      }
    />
  )
}
