import { useCallback, useEffect, useRef, useState } from 'react'
import { FilePlus2, FileText, FolderOpen, Loader2, Play, RefreshCw, Search, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { BRAND, BrandFooter, BrandLogo } from '@/components/brand/Brand'
import { api, type InspectionSummary, type PartSummary, type RevisionSummary } from '@/lib/api'
import { MAX_UPLOAD_MB, refusalBeforeSend, UploadResults, type UploadRow } from './UploadResults'
import { openInspectionFromServer } from '@/lib/project'
import { cn } from '@/lib/utils'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.round(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return new Date(iso).toLocaleDateString()
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <div className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
      <span className="h-1.5 w-20 overflow-hidden rounded bg-muted">
        <span className="block h-full bg-status-pass" style={{ width: `${pct}%` }} />
      </span>
      {done} / {total}
    </div>
  )
}

function InspectionRow({ i, onOpen, onDelete, busy }: { i: InspectionSummary; onOpen: () => void; onDelete: () => void; busy: boolean }) {
  const complete = i.characteristics > 0 && i.measured === i.characteristics
  return (
    <tr className="border-t text-xs hover:bg-accent/40">
      <td className="px-3 py-2 font-medium">{i.title}</td>
      <td className="px-3 py-2 text-muted-foreground">{i.fairNumber || '—'}</td>
      <td className="px-3 py-2 tabular-nums">{i.characteristics}</td>
      <td className="px-3 py-2"><Progress done={i.measured} total={i.characteristics} /></td>
      <td className="px-3 py-2">
        <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', complete ? 'bg-status-pass/15 text-status-pass' : 'bg-status-draft/15 text-status-draft')}>
          {complete ? 'Complete' : 'In progress'}
        </span>
      </td>
      <td className="px-3 py-2 text-muted-foreground">{timeAgo(i.updatedAt)}</td>
      <td className="px-3 py-2 text-right">
        <div className="flex justify-end gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDelete} disabled={busy} aria-label="Delete inspection">
                <Trash2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete inspection</TooltipContent>
          </Tooltip>
          <Button size="sm" className="h-7 gap-1.5" onClick={onOpen} disabled={busy}>
            <FolderOpen /> Open
          </Button>
        </div>
      </td>
    </tr>
  )
}

export function LibraryScreen() {
  const [parts, setParts] = useState<PartSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploads, setUploads] = useState<UploadRow[]>([])
  const fileInput = useRef<HTMLInputElement>(null)
  const pendingPartId = useRef<string | undefined>(undefined)

  const refresh = useCallback(async () => {
    try {
      const list = await api.listParts()
      setParts(list)
      setError(null)
      setSelectedId((cur) => cur && list.some((p) => p.id === cur) ? cur : list[0]?.id ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the server')
      setParts([])
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const selected = parts?.find((p) => p.id === selectedId) ?? null
  const filtered = (parts ?? []).filter((p) => {
    const q = query.trim().toLowerCase()
    return !q || p.partNumber.toLowerCase().includes(q) || p.partName.toLowerCase().includes(q)
  })

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    try {
      await fn()
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  /** Open a stored revision: its latest inspection, or a first one when it has none. */
  const openRevision = async (revisionId: string) => {
    const list = await api.listParts()
    const rev = list.flatMap((p) => p.revisions).find((r) => r.id === revisionId)
    const last = rev?.inspections[rev.inspections.length - 1]
    const inspectionId = last?.id ?? (await api.createInspection(revisionId, 'Full FAI')).id
    await openInspectionFromServer(inspectionId)
  }

  /**
   * Take one or many PDFs. Each file is checked and gets a plain outcome; a single good file opens straight away.
   * Dropped on a part, the files become its revisions; otherwise each file is its own part.
   */
  const importFiles = (files: File[], partId?: string) =>
    run('import', async () => {
      if (files.length === 0) return
      const stamp = Date.now()
      const rows: UploadRow[] = files.map((f, i) => ({ key: `${stamp}-${i}`, name: f.name, state: 'waiting', detail: '' }))
      const show = (i: number, patch: Partial<UploadRow>) => {
        rows[i] = { ...rows[i], ...patch }
        setUploads([...rows])
      }
      setUploads([...rows])
      for (let i = 0; i < files.length; i++) {
        const refusal = refusalBeforeSend(files[i])
        if (refusal) {
          show(i, { state: 'refused', detail: refusal })
          continue
        }
        show(i, { state: 'sending' })
        try {
          const rev = await api.importRevision(files[i], { partId })
          const sheets = `${rev.sheets} ${rev.sheets === 1 ? 'sheet' : 'sheets'}`
          const where = `${rev.partNumber} · Rev ${rev.revision} · ${sheets}`
          const note = rev.duplicate ? 'Already in the library, not stored twice' : rev.intake.reason || rev.intake.verdict
          show(i, {
            state: rev.intake.level === 'ok' ? 'ready' : rev.intake.level === 'warn' ? 'review' : 'unreadable',
            detail: `${where} · ${note}`,
            revisionId: rev.id,
            partId: rev.partId,
          })
        } catch (e) {
          show(i, { state: 'refused', detail: e instanceof Error ? e.message : 'The upload failed' })
        }
      }
      await refresh()
      const stored = rows.filter((r) => r.revisionId)
      if (stored.length > 0) setSelectedId(stored[stored.length - 1].partId ?? null)
      // One readable drawing: go straight to work, as before.
      if (files.length === 1 && stored.length === 1 && stored[0].state !== 'unreadable') {
        await openRevision(stored[0].revisionId as string)
        setUploads([])
      }
    })

  const onDrop = (e: React.DragEvent, partId?: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    void importFiles(Array.from(e.dataTransfer.files ?? []), partId)
  }

  const pickFile = (partId?: string) => {
    pendingPartId.current = partId
    fileInput.current?.click()
  }

  const openInspection = (i: InspectionSummary) => run(i.id, () => openInspectionFromServer(i.id).then(() => undefined))

  const balloonRevision = (r: RevisionSummary) =>
    run(r.id, async () => {
      const n = r.inspections.length + 1
      const insp = await api.createInspection(r.id, n === 1 ? 'Full FAI' : `Inspection ${n}`)
      await refresh()
      await openInspectionFromServer(insp.id)
    })

  const deleteInspection = (i: InspectionSummary) =>
    run(i.id, async () => {
      await api.deleteInspection(i.id)
      await refresh()
    })

  const deleteRevision = (r: RevisionSummary) =>
    run(r.id, async () => {
      await api.deleteRevision(r.id)
      await refresh()
    })

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full flex-col bg-background" onDragOver={(e) => e.preventDefault()}>
        <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
          <BrandLogo height={20} />
          <div className="h-6 w-px bg-border" />
          <div className="min-w-0">
            <div className="whitespace-nowrap text-sm font-semibold tracking-tight">{BRAND.product}</div>
            <div className="text-[11px] leading-none text-muted-foreground">Drawing library</div>
          </div>
          <div className="relative ml-auto w-64">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search part number or name" className="h-8 pl-7" aria-label="Search parts" />
          </div>
          <Button size="sm" className="h-8 gap-1.5" onClick={() => pickFile(undefined)} disabled={busy !== null}>
            {busy === 'import' ? <Loader2 className="animate-spin" /> : <FilePlus2 />} New from PDF
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void refresh()} aria-label="Refresh">
                <RefreshCw />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>
          <ThemeToggle />
        </header>

        {error && (
          <div className="border-b border-status-fail/30 bg-status-fail/10 px-4 py-1.5 text-xs text-status-fail" role="alert">
            {error}
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-[300px_1fr]">
          <aside className="min-h-0 overflow-y-auto border-r bg-muted/30">
            {parts === null ? (
              <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Loading library…</div>
            ) : filtered.length === 0 ? (
              <div
                className={cn('m-4 rounded-lg border-2 border-dashed p-6 text-center text-xs text-muted-foreground', dragOver && 'border-primary bg-primary/5')}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => onDrop(e)}
              >
                <Upload className="mx-auto mb-2 size-5" />
                {parts.length === 0 ? 'No drawings yet. Drop a PDF here or use New from PDF.' : 'No parts match the search.'}
              </div>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDrop(e, p.id)}
                  className={cn(
                    'block w-full border-b px-4 py-2.5 text-left transition-colors hover:bg-accent/60',
                    p.id === selectedId && 'bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))] hover:bg-primary/15',
                  )}
                >
                  <div className="font-mono text-sm font-medium">{p.partNumber}</div>
                  <div className="truncate text-xs text-muted-foreground">{p.partName || 'Unnamed part'}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {p.revisions.length} {p.revisions.length === 1 ? 'revision' : 'revisions'} · {p.revisions.reduce((n, r) => n + r.inspections.length, 0)} inspections
                  </div>
                </button>
              ))
            )}
          </aside>

          <main
            className={cn('min-h-0 overflow-y-auto p-4', dragOver && 'bg-primary/5')}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => onDrop(e, selected?.id)}
          >
            <UploadResults rows={uploads} busy={busy !== null} onClear={() => setUploads([])} onOpen={(row) => void run(row.key, () => openRevision(row.revisionId as string))} />
            {!selected ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                <Upload className="size-6" />
                <p>Drop PDFs anywhere on this page to start. One or many, up to {MAX_UPLOAD_MB} MB each.</p>
                <Button size="sm" onClick={() => pickFile(undefined)}><FilePlus2 /> New from PDF</Button>
              </div>
            ) : (
              <div className="mx-auto max-w-5xl space-y-4">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <h1 className="font-mono text-lg font-semibold">{selected.partNumber}</h1>
                    <p className="text-sm text-muted-foreground">{selected.partName || 'Unnamed part'}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => pickFile(selected.id)} disabled={busy !== null}>
                      <Upload /> Add revision
                    </Button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={busy !== null}
                          aria-label="Delete part"
                          onClick={() => void run(selected.id, async () => { await api.deletePart(selected.id); await refresh() })}
                        >
                          <Trash2 />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Delete part with all revisions and inspections</TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                {[...selected.revisions].reverse().map((r, idx) => (
                  <section key={r.id} className="overflow-hidden rounded-lg border">
                    <header className="flex items-center gap-3 bg-muted/40 px-3 py-2 text-sm">
                      <FileText className="size-4 text-muted-foreground" />
                      <span className="font-semibold">Rev {r.revision}</span>
                      <span className={cn('rounded-full border px-2 text-[10px]', idx === 0 ? 'border-status-pass text-status-pass' : 'text-muted-foreground')}>
                        {idx === 0 ? 'current' : 'superseded'}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {r.fileName} · {r.sheets} {r.sheets === 1 ? 'sheet' : 'sheets'} · imported {timeAgo(r.importedAt)}
                      </span>
                      <div className="ml-auto flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void deleteRevision(r)} disabled={busy !== null} aria-label="Delete revision">
                              <Trash2 />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete revision and its inspections</TooltipContent>
                        </Tooltip>
                        <Button variant="outline" size="sm" className="h-7 gap-1.5" onClick={() => void balloonRevision(r)} disabled={busy !== null}>
                          {busy === r.id ? <Loader2 className="animate-spin" /> : <Play />} Balloon this revision
                        </Button>
                      </div>
                    </header>
                    {r.inspections.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-muted-foreground">No inspections yet.</p>
                    ) : (
                      <table className="w-full">
                        <thead>
                          <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                            <th className="px-3 py-1.5 font-semibold">Inspection</th>
                            <th className="px-3 py-1.5 font-semibold">FAIR</th>
                            <th className="px-3 py-1.5 font-semibold">Chars</th>
                            <th className="px-3 py-1.5 font-semibold">Measured</th>
                            <th className="px-3 py-1.5 font-semibold">Status</th>
                            <th className="px-3 py-1.5 font-semibold">Updated</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {r.inspections.map((i) => (
                            <InspectionRow key={i.id} i={i} busy={busy !== null} onOpen={() => void openInspection(i)} onDelete={() => void deleteInspection(i)} />
                          ))}
                        </tbody>
                      </table>
                    )}
                  </section>
                ))}

                <div
                  className={cn('rounded-lg border-2 border-dashed p-5 text-center text-xs text-muted-foreground', dragOver && 'border-primary')}
                >
                  Drop PDFs here to add revisions to {selected.partNumber}
                </div>
              </div>
            )}
          </main>
        </div>

        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            void importFiles(Array.from(e.target.files ?? []), pendingPartId.current)
            e.target.value = ''
          }}
        />
        <BrandFooter />
      </div>
    </TooltipProvider>
  )
}
