import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, ChevronRight, Download, FolderOpen, ListOrdered, MoreHorizontal, Redo2, Save, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { BrandLogo } from '@/components/brand/Brand'
import { ExportDialog } from '@/components/export/ExportDialog'
import { SaveStatus } from '@/components/layout/SaveStatus'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { useCharacteristicStore } from '@/store/characteristicStore'
import { useDocumentStore } from '@/store/documentStore'
import { useRecognizeStore } from '@/store/recognizeStore'
import { useSessionStore } from '@/store/sessionStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useUiStore } from '@/store/uiStore'
import { closeInspection, downloadProjectFile, importProjectFile } from '@/lib/project'
import { progressOf } from '@/lib/progress'
import { cn } from '@/lib/utils'

function Stage({ n, label, count, state, hint, onClick, testId, last }: { n: number; label: string; count?: string; state: 'done' | 'now' | 'todo'; hint: string; onClick?: () => void; testId: string; last?: boolean }) {
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            disabled={!onClick}
            data-testid={testId}
            data-state={state}
            aria-current={state === 'now' ? 'step' : undefined}
            className={cn(
              'flex h-8 items-center gap-2 whitespace-nowrap rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors enabled:hover:bg-accent enabled:hover:text-foreground disabled:cursor-default',
              state === 'now' && 'font-semibold text-foreground',
            )}
          >
            <span
              className={cn(
                'grid size-5 place-items-center rounded-full border text-[10px] font-bold',
                state === 'done' && 'border-status-pass bg-status-pass text-white',
                state === 'now' && 'border-primary bg-primary text-primary-foreground',
                state === 'todo' && 'bg-muted text-muted-foreground',
              )}
            >
              {state === 'done' ? <Check className="size-3" strokeWidth={3} /> : n}
            </span>
            {label}
            {count && <span className="hidden font-normal tabular-nums text-muted-foreground lg:inline">{count}</span>}
          </button>
        </TooltipTrigger>
        <TooltipContent>{hint}</TooltipContent>
      </Tooltip>
      {!last && <span className={cn('h-0.5 w-5 rounded-full', state === 'done' ? 'bg-status-pass' : 'bg-border')} aria-hidden />}
    </>
  )
}

/** Brand and place on the left, how far the job is in the middle, save state and the one primary action on the right. */
export function WorkspaceTopBar() {
  const partLabel = useSessionStore((s) => s.partLabel)
  const inspectionTitle = useSessionStore((s) => s.inspectionTitle)
  const revisionId = useSessionStore((s) => s.revisionId)
  const ready = useDocumentStore((s) => s.status === 'ready')
  const pageHeight = useDocumentStore((s) => s.pages[s.pageIndex]?.height ?? 1)
  const items = useCharacteristicStore((s) => s.items)
  const canUndo = useCharacteristicStore((s) => s.past.length > 0)
  const canRedo = useCharacteristicStore((s) => s.future.length > 0)
  const undo = useCharacteristicStore((s) => s.undo)
  const redo = useCharacteristicStore((s) => s.redo)
  const renumber = useCharacteristicStore((s) => s.renumber)
  const defaults = useSettingsStore((s) => s.defaults)
  const setShow = useUiStore((s) => s.setShow)
  const recognized = useRecognizeStore((s) => Object.keys(s.pages).length > 0) || items.some((c) => c.source === 'auto')
  const recognizing = useRecognizeStore((s) => s.status === 'running')
  const runRecognize = useRecognizeStore((s) => s.run)

  const [exportOpen, setExportOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const p = progressOf(items, defaults)
  const hasItems = items.length > 0

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e' && ready && hasItems) {
        e.preventDefault()
        setExportOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ready, hasItems])

  useEffect(() => {
    if (!menu) return
    const onDown = (e: PointerEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false)
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [menu])

  const onImportFile = async (file: File) => {
    try {
      const { warning } = await importProjectFile(file)
      setNote(warning ?? `Loaded ${file.name}`)
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not read the file')
    }
    window.setTimeout(() => setNote(null), 6000)
  }

  const reviewDone = hasItems && p.drafts === 0
  const measureDone = p.measurable > 0 && p.measured === p.measurable

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-background px-3" data-testid="top-bar">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeInspection} aria-label="Back to the library">
            <ArrowLeft />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Back to the library</TooltipContent>
      </Tooltip>
      <BrandLogo height={18} className="hidden md:inline-flex" />
      <nav aria-label="You are here" className="hidden min-w-0 items-center gap-1 text-xs text-muted-foreground lg:flex">
        <button type="button" className="hover:text-foreground" onClick={closeInspection}>Library</button>
        <ChevronRight className="size-3.5 shrink-0" />
        <span className="truncate">{partLabel}</span>
        <ChevronRight className="size-3.5 shrink-0" />
        <span className="truncate font-semibold text-foreground">{inspectionTitle}</span>
      </nav>

      {/* Progress of the job, not tabs: one workspace, and these say how far it is. */}
      <div className="mx-auto flex items-center" role="group" aria-label="Progress of the inspection" data-testid="job-progress">
        <Stage n={1} label={recognizing ? 'Reading…' : 'Read'} state={recognized ? 'done' : 'now'} testId="stage-read"
          hint={recognized ? 'The drawing has been read and balloons placed' : 'Read the drawing to place balloons'}
          onClick={!recognized && revisionId && !recognizing ? () => void runRecognize() : undefined} />
        <Stage n={2} label="Check" count={hasItems ? `${p.accepted} / ${p.total}` : undefined} state={reviewDone ? 'done' : recognized ? 'now' : 'todo'} testId="stage-check"
          hint={reviewDone ? 'Every balloon is confirmed' : `${p.drafts} still to confirm. Click to list them`} onClick={hasItems ? () => setShow('check') : undefined} />
        <Stage n={3} label="Measure" count={hasItems ? `${p.measured} / ${p.measurable}` : undefined} state={measureDone ? 'done' : reviewDone ? 'now' : 'todo'} testId="stage-measure"
          hint={measureDone ? 'Every result is entered' : `${p.toMeasure} confirmed and waiting for a result. Click to list them`} onClick={hasItems ? () => setShow('measure') : undefined} />
        <Stage n={4} label="Report" state={measureDone ? 'now' : 'todo'} testId="stage-report" last
          hint="AS9102 forms, PPAP results and the ballooned drawing" onClick={hasItems ? () => setExportOpen(true) : undefined} />
      </div>

      {note && <span className="max-w-[220px] truncate text-[11px] text-muted-foreground" role="status">{note}</span>}
      <SaveStatus />
      <div className="flex items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={undo} disabled={!canUndo} aria-label="Undo"><Undo2 /></Button>
          </TooltipTrigger>
          <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={redo} disabled={!canRedo} aria-label="Redo"><Redo2 /></Button>
          </TooltipTrigger>
          <TooltipContent>Redo (Ctrl+Y)</TooltipContent>
        </Tooltip>
        <div className="relative" ref={menuRef}>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMenu((v) => !v)} aria-label="More actions" aria-expanded={menu}><MoreHorizontal /></Button>
          {menu && (
            <div role="menu" className="absolute right-0 top-9 z-40 w-56 rounded-md border bg-background p-1 text-xs shadow-xl">
              {[
                { icon: <ListOrdered />, label: 'Renumber by zone', run: () => renumber(pageHeight), off: !hasItems },
                { icon: <Save />, label: 'Save as a file', hint: 'Ctrl+S', run: downloadProjectFile, off: !ready },
                { icon: <FolderOpen />, label: 'Open a file into this inspection', run: () => fileInput.current?.click(), off: !ready },
              ].map((m) => (
                <button key={m.label} type="button" role="menuitem" disabled={m.off} onClick={() => { m.run(); setMenu(false) }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent disabled:opacity-40 [&_svg]:size-3.5">
                  {m.icon}<span className="flex-1">{m.label}</span>{m.hint && <span className="text-[10px] text-muted-foreground">{m.hint}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <ThemeToggle />
      </div>
      <Button size="sm" className="h-8 gap-1.5" onClick={() => setExportOpen(true)} disabled={!ready || !hasItems} data-testid="export-button">
        <Download /> <span className="hidden sm:inline">Export FAI</span>
      </Button>
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <input ref={fileInput} type="file" accept="application/json,.json" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImportFile(f); e.target.value = '' }} />
    </header>
  )
}
