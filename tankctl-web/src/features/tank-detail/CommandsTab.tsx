import { useCommandHistory } from '../../api/commands'
import { EmptyState } from '../../components/EmptyState'
import { Badge } from '../../components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table'

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  sent: 'Sent',
  executed: 'Executed',
  failed: 'Failed',
  timeout: 'Timed out',
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline',
  sent: 'secondary',
  executed: 'default',
  failed: 'destructive',
  timeout: 'destructive',
}

export function CommandsTab({ deviceId }: { deviceId: string }) {
  const { data, isLoading } = useCommandHistory(deviceId, 50)

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading command history…</p>
  if (!data || data.commands.length === 0) {
    return <EmptyState title="No commands sent yet" description="Commands sent from Light/Relays tabs will show up here." />
  }

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Command</TableHead>
            <TableHead>Value</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.commands.map((c) => (
            <TableRow key={c.command_id ?? `${c.command}-${c.version}`}>
              <TableCell className="font-mono">{c.created_at ? new Date(c.created_at).toLocaleString() : '—'}</TableCell>
              <TableCell>{c.command}</TableCell>
              <TableCell className="font-mono">{c.value ?? '—'}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[c.status] ?? 'outline'}>{STATUS_LABEL[c.status] ?? c.status}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
