import { useEffect } from 'react'
import { CheckCheck, Lightbulb, Loader2, Plus, ScanSearch, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { focusAt, openGroups, useRecognizeStore } from '@/store/recognizeStore'
import { useCharacteristicStore } from '@/store/characteristicStore'
import { useDocumentStore } from '@/store/documentStore'
import { useSessionStore } from '@/store/sessionStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useUiStore } from '@/store/uiStore'
import { progressOf, workStateOf } from '@/lib/progress'
import { Empty, Group } from './parts'
import { WorkList } from './WorkList'

/** Share of the job that is confirmed, as a ring. */
function Ring({ value }: { value: number }) {
  const r = 17
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 44 44" className="size-11 shrink-0" role="img" aria-label={`${value} percent confirmed`}>
      <circle cx="22" cy="22" r={r} fill="none" strokeWidth="5" className="stroke-muted" />
      <circle cx="22" cy="22" r={r} fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-status-pass transition-[stroke-dashoffset] duration-500" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} transform="rotate(-90 22 22)" />
      <text x="22" y="26" textAnchor="middle" className="fill-foreground text-[11px] font-bold tabular-nums">{value}%</text>
    </svg>
  )
}

/**
 * Left panel: the work list. Progress on top, then every balloon (problems first, then sheet by sheet),
 * what the recognizer suggests adding, and the one-click accept. Facts about the sheet live in the
 * detail panel, where they show whenever nothing is selected.
 */
export function SidePanel() {
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen)
  const items = useCharacteristicStore((s) => s.items)
  const select = useCharacteristicStore((s) => s.select)
  const acceptIds = useCharacteristicStore((s) => s.acceptIds)
  const defaults = useSettingsStore((s) => s.defaults)
  const pageIndex = useDocumentStore((s) => s.pageIndex)
  const ready = useDocumentStore((s) => s.status === 'ready')
  const revisionId = useSessionStore((s) => s.revisionId)
  const page = useRecognizeStore((s) => s.pages[pageIndex])
  const status = useRecognizeStore((s) => s.status)
  const error = useRecognizeStore((s) => s.error)
  const run = useRecognizeStore((s) => s.run)
  const adopt = useRecognizeStore((s) => s.adopt)
  const intake = useRecognizeStore((s) => s.intake)
  const loadIntake = useRecognizeStore((s) => s.loadIntake)

  useEffect(() => {
    if (revisionId && ready) void loadIntake(revisionId)
  }, [revisionId, ready, loadIntake])

  const p = progressOf(items, defaults)
  const running = status === 'running'
  const unreadable = intake?.level === 'bad'
  const clean = items.filter((c) => workStateOf(c, defaults) === 'check')
  const suggestions = openGroups(page)
  const percent = p.total === 0 ? 0 : Math.round((100 * p.accepted) / p.total)

  return (
    <aside className="flex h-full flex-col gap-2 bg-sidebar p-2.5" data-testid="side-panel">
      <section className="flex shrink-0 items-center gap-2.5 px-0.5" data-testid="queue-progress">
        <Ring value={percent} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold tabular-nums leading-tight">
            {p.accepted} <span className="text-xs font-medium text-muted-foreground">of {p.total} confirmed</span>
          </p>
          <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-muted">
            {[
              { n: p.passed, cls: 'bg-status-pass' }, { n: p.fails, cls: 'bg-status-fail' }, { n: p.accepted - p.passed - p.fails, cls: 'bg-status-pass/45' },
              { n: p.flagged, cls: 'bg-status-fail/60' }, { n: p.drafts - p.flagged, cls: 'bg-muted-foreground/25' },
            ].map((b, i) => <span key={i} className={b.cls} style={{ width: `${p.total ? (100 * b.n) / p.total : 0}%` }} />)}
          </div>
          <p className="mt-1 truncate text-[11px] tabular-nums text-muted-foreground">
            {p.flagged > 0 && <span className="text-status-fail">{p.flagged} flagged · </span>}
            {p.drafts - p.flagged} waiting{p.measurable > 0 && <> · {p.measured} of {p.measurable} measured</>}
          </p>
        </div>
      </section>

      {!page && items.length === 0 ? (
        <section className="shrink-0 rounded-lg border border-dashed bg-background p-3 text-center">
          <p className="text-xs text-muted-foreground">{unreadable ? 'This sheet has no readable text. Balloon it by hand, or ask for a vector PDF export from CAD.' : 'Read the drawing to place balloons automatically.'}</p>
          <Button size="sm" className="mt-2.5 w-full gap-1.5" onClick={() => void run()} disabled={!ready || !revisionId || running || unreadable} data-testid="recognize-run">
            {running ? <Loader2 className="animate-spin" /> : <ScanSearch />} {running ? 'Reading…' : 'Recognize this sheet'}
          </Button>
          {error && <p className="mt-2 text-[11px] text-status-fail" role="alert">{error}</p>}
        </section>
      ) : null}

      {items.length > 0 ? <WorkList /> : <div className="flex-1" />}

      {suggestions.length > 0 && (
        <div className="max-h-[38%] shrink-0 overflow-y-auto">
          <Group id="suggestions" icon={<Lightbulb className="text-status-draft" />} title="Suggested to add" count={suggestions.length} tone="warn">
            {suggestions.length === 0 && <Empty>Nothing was left unplaced on this sheet.</Empty>}
            {suggestions.map((g) => (
              <div key={g.guess.id} className="flex items-center gap-2 border-t px-2.5 py-1.5" data-testid="needs-you-row">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => focusAt(g.guess.anchor.x, g.guess.anchor.y, (page?.dimensionFontSize ?? 12) * 0.6)}>
                  <span className="block truncate text-xs font-semibold" title={g.guess.specification}>{g.guess.specification || g.tokens.map((t) => t.text).join(' ')}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{g.guess.descriptionType === 'Note' ? 'A drawing note. Add it if it is inspected' : g.tokens[0]?.reason || 'Read with low confidence'}</span>
                </button>
                <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[11px]" onClick={() => adopt(g.guess.id)}><Plus className="size-3" /> Add</Button>
              </div>
            ))}
          </Group>
        </div>
      )}

      <div className="shrink-0 space-y-1">
        {clean.length > 0 && (
          <Tooltip><TooltipTrigger asChild>
            <Button size="sm" variant="outline" className="w-full gap-1.5 bg-background" onClick={() => { acceptIds(clean.map((c) => c.id)); select(null) }} data-testid="accept-all">
              <CheckCheck /> Accept the {clean.length} without flags
            </Button>
          </TooltipTrigger><TooltipContent>Confirms every balloon whose checks passed. Flagged ones stay for you. One undo step.</TooltipContent></Tooltip>
        )}
        <Button size="sm" variant="ghost" className="h-7 w-full justify-start gap-1.5 text-muted-foreground" onClick={() => setSettingsOpen(true)}>
          <Settings2 /> Inspection settings
        </Button>
      </div>
    </aside>
  )
}
