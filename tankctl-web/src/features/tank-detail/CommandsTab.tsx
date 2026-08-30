import { useCommandHistory } from '../../api/commands'
import { EmptyState } from '../../components/EmptyState'
import './tab-panels.css'

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  sent: 'Sent',
  executed: 'Executed',
  failed: 'Failed',
  timeout: 'Timed out',
}

export function CommandsTab({ deviceId }: { deviceId: string }) {
  const { data, isLoading } = useCommandHistory(deviceId, 50)

  if (isLoading) return <p>Loading command history…</p>
  if (!data || data.commands.length === 0) {
    return <EmptyState title="No commands sent yet" description="Commands sent from Light/Relays tabs will show up here." />
  }

  return (
    <div className="card">
      <table className="data-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Command</th>
            <th>Value</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {data.commands.map((c) => (
            <tr key={c.command_id ?? `${c.command}-${c.version}`}>
              <td className="mono">{c.created_at ? new Date(c.created_at).toLocaleString() : '—'}</td>
              <td>{c.command}</td>
              <td className="mono">{c.value ?? '—'}</td>
              <td>
                <span className={`command-status command-status--${c.status}`}>{STATUS_LABEL[c.status] ?? c.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
