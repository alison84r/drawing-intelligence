import { AlertTriangle, CheckCircle2, FolderOpen, Loader2, X, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const MAX_UPLOAD_MB = 100

export interface UploadRow {
  key: string
  name: string
  state: 'waiting' | 'sending' | 'ready' | 'review' | 'unreadable' | 'refused'
  /** One plain line: what we found, or why the file was not taken. */
  detail: string
  revisionId?: string
  partId?: string
}

/** A reason the browser can give before anything is sent, or null when the file may go. */
export function refusalBeforeSend(file: File): string | null {
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return 'This is not a PDF file'
  if (file.size === 0) return 'The file is empty'
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) return `The file is larger than ${MAX_UPLOAD_MB} MB`
  return null
}

const LOOK: Record<UploadRow['state'], { tone: string; label: string; icon: React.ReactNode }> = {
  waiting: { tone: 'bg-muted/50', label: 'Waiting', icon: <Loader2 className="text-muted-foreground" /> },
  sending: { tone: 'bg-muted/50', label: 'Checking', icon: <Loader2 className="animate-spin text-primary" /> },
  ready: { tone: 'bg-status-pass/10', label: 'Ready', icon: <CheckCircle2 className="text-status-pass" /> },
  review: { tone: 'bg-status-draft/10', label: 'Opens, check the notes', icon: <AlertTriangle className="text-status-draft" /> },
  unreadable: { tone: 'bg-status-draft/10', label: 'Stored, manual balloons only', icon: <AlertTriangle className="text-status-draft" /> },
  refused: { tone: 'bg-status-fail/10', label: 'Not taken', icon: <XCircle className="text-status-fail" /> },
}

/** What happened to each dropped file: ready, usable with care, or refused with the reason. */
export function UploadResults({ rows, busy, onOpen, onClear }: { rows: UploadRow[]; busy: boolean; onOpen: (row: UploadRow) => void; onClear: () => void }) {
  if (rows.length === 0) return null
  const working = rows.some((r) => r.state === 'waiting' || r.state === 'sending')
  return (
    <section className="mx-auto mb-4 max-w-5xl overflow-hidden rounded-lg border" aria-label="Uploaded files" data-testid="upload-results">
      <header className="flex items-center gap-2 bg-muted/40 px-3 py-2 text-xs">
        <span className="font-semibold">{working ? 'Checking files' : 'Upload finished'}</span>
        <span className="text-muted-foreground">
          {rows.filter((r) => r.revisionId).length} stored · {rows.filter((r) => r.state === 'refused').length} not taken
        </span>
        <Button variant="ghost" size="icon" className="ml-auto h-6 w-6" onClick={onClear} disabled={working} aria-label="Hide the upload list">
          <X />
        </Button>
      </header>
      <ul>
        {rows.map((r) => (
          <li key={r.key} className={cn('flex items-center gap-3 border-t px-3 py-2 text-xs [&_svg]:size-4 [&_svg]:shrink-0', LOOK[r.state].tone)} data-state={r.state}>
            {LOOK[r.state].icon}
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{r.name}</div>
              {r.detail && <div className="truncate text-muted-foreground">{r.detail}</div>}
            </div>
            <span className="whitespace-nowrap font-medium">{LOOK[r.state].label}</span>
            {r.revisionId && (
              <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={() => onOpen(r)} disabled={busy}>
                <FolderOpen /> Open
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
