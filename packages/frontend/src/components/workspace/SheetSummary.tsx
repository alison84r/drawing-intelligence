import { useEffect, useState } from 'react'
import { ArrowRight, CheckCheck, CircleAlert, CircleCheck, CircleX, LayoutGrid, Ruler, Sparkles, Table2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { focusAt, useRecognizeStore } from '@/store/recognizeStore'
import { useCharacteristicStore } from '@/store/characteristicStore'
import { useDocumentStore } from '@/store/documentStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useUiStore } from '@/store/uiStore'
import { progressOf, workStateOf } from '@/lib/progress'
import { selectRelative } from '@/lib/workflow'
import { cn } from '@/lib/utils'
import { api, type AssistStatus, type SheetGrid } from '@/lib/api'
import { AssistDialog } from '@/components/assist/AssistDialog'
import { TableDialog } from './TableDialog'
import { Fact, pill } from './parts'

function Stat({ value, label, tone }: { value: number | string; label: string; tone?: 'bad' | 'ok' }) {
  return (
    <div className="min-w-0 rounded-md border bg-background px-2.5 py-1.5">
      <p className={cn('text-base font-bold leading-tight tabular-nums', tone === 'bad' && 'text-status-fail', tone === 'ok' && 'text-status-pass')}>{value}</p>
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}

/**
 * What the detail panel shows while no balloon is selected: where this sheet stands, the next step,
 * and the facts about the sheet (readability, tolerance, views, tables, AI reading).
 */
export function SheetSummary() {
  const items = useCharacteristicStore((s) => s.items)
  const acceptIds = useCharacteristicStore((s) => s.acceptIds)
  const defaults = useSettingsStore((s) => s.defaults)
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen)
  const pageIndex = useDocumentStore((s) => s.pageIndex)
  const pageCount = useDocumentStore((s) => s.pageCount)
  const ready = useDocumentStore((s) => s.status === 'ready')
  const page = useRecognizeStore((s) => s.pages[pageIndex])
  const stale = useRecognizeStore((s) => s.stale)
  const intake = useRecognizeStore((s) => s.intake)

  const [assist, setAssist] = useState<AssistStatus | null>(null)
  const [assistOpen, setAssistOpen] = useState(false)
  const [shownGrid, setShownGrid] = useState<SheetGrid | null>(null)
  const [listed, setListed] = useState<'views' | 'tables' | null>(null)
  useEffect(() => {
    api.assistStatus().then(setAssist).catch(() => setAssist(null))
  }, [])

  const here = items.filter((c) => c.page === pageIndex)
  const p = progressOf(here, defaults)
  const all = progressOf(items, defaults)
  const clean = items.filter((c) => workStateOf(c, defaults) === 'check')
  const scheme = defaults.scheme
  const toleranceNote = page?.tolerance?.findings.find((f) => f.level === 'warn' && !f.text.startsWith('Angular'))

  const next = all.flagged > 0
    ? { text: `${all.flagged} flagged: decide on ${all.flagged === 1 ? 'it' : 'them'} first`, run: () => { useUiStore.getState().setShow('flagged'); selectRelative(1) } }
    : clean.length > 0 ? null
    : all.toMeasure > 0 ? { text: `Enter the measured values (${all.toMeasure} to go)`, run: () => selectRelative(1) }
    : null

  return (
    <aside className="flex h-full flex-col bg-background" data-testid="inspector" data-empty>
      <header className="border-b px-4 py-2.5">
        <p className="text-xs font-semibold">{pageCount > 1 ? `Sheet ${pageIndex + 1} of ${pageCount}` : 'This sheet'}</p>
        <p className="text-[11px] text-muted-foreground">Nothing is selected. Pick a balloon on the drawing, in the list or in the table.</p>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <div className="grid grid-cols-3 gap-2" data-testid="sheet-stats">
          <Stat value={p.total} label="balloons" />
          <Stat value={p.drafts} label="to check" tone={p.flagged > 0 ? 'bad' : undefined} />
          <Stat value={`${p.measured}/${p.measurable}`} label="measured" tone={p.measurable > 0 && p.measured === p.measurable ? 'ok' : undefined} />
        </div>

        {items.length > 0 && (
          <div className="rounded-lg border bg-muted/30 p-2.5" data-testid="next-step">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Next step</p>
            {clean.length > 0 && all.flagged === 0 ? (
              <Button size="sm" className="mt-1.5 w-full gap-1.5" onClick={() => acceptIds(clean.map((c) => c.id))}>
                <CheckCheck /> Accept the {clean.length} without flags
              </Button>
            ) : next ? (
              <Button size="sm" className="mt-1.5 w-full justify-between gap-1.5" onClick={next.run}>{next.text} <ArrowRight /></Button>
            ) : (
              <p className="mt-1 text-xs font-medium text-status-pass">{all.fails > 0 ? `${all.fails} failed. Review them, then export the report.` : 'Everything is confirmed and measured. Export the report.'}</p>
            )}
          </div>
        )}

        <section className="overflow-hidden rounded-lg border" data-testid="sheet-facts">
          {intake && (
            <Fact label="Readable" icon={intake.level === 'ok' ? <CircleCheck className="text-status-pass" /> : intake.level === 'warn' ? <CircleAlert className="text-status-draft" /> : <CircleX className="text-status-fail" />}>
              <span title={intake.pages[0]?.rows.map((r) => `${r.label}: ${r.value}`).join('\n')}>{intake.verdict}</span>
            </Fact>
          )}
          <Fact label="Tolerance" icon={<Ruler className={scheme ? 'text-status-pass' : 'text-status-draft'} />}>
            {scheme ? scheme.label : 'By decimal places'}{' '}
            <span className={cn('ml-1 rounded-full px-1.5 py-px text-[10px] font-semibold', scheme?.source === 'drawing' ? 'bg-status-pass/15 text-status-pass' : 'bg-muted text-muted-foreground')}>
              {scheme?.source === 'drawing' ? 'From the sheet' : scheme?.source === 'assist' ? 'AI, confirmed' : scheme ? 'Standard table' : 'Settings'}
            </span>
            <button type="button" className="ml-1.5 text-primary underline-offset-2 hover:underline" onClick={() => setSettingsOpen(true)}>Change</button>
            {!scheme && toleranceNote && <span className="mt-1 block text-left text-[11px] font-normal text-status-draft">{toleranceNote.text}</span>}
          </Fact>
          {page?.audit && <Fact label="Lengths" icon={<CircleCheck className="text-status-pass" />}>{page.audit.verified} agree with their dimension line</Fact>}
          {page?.views && page.views.length > 0 && (
            <Fact label="Views" icon={<LayoutGrid className="text-primary" />}>
              <button type="button" className={pill} aria-expanded={listed === 'views'} onClick={() => setListed(listed === 'views' ? null : 'views')} data-testid="sheet-views">{page.views.length} · {listed === 'views' ? 'hide' : 'list'}</button>
            </Fact>
          )}
          {listed === 'views' && page?.views && (
            <div className="flex flex-wrap gap-1 border-t bg-muted/30 px-3 py-2">
              {page.views.map((v) => (
                <button key={v.id} type="button" className={pill} onClick={() => focusAt(v.bbox.x + v.bbox.w / 2, v.bbox.y + v.bbox.h / 2, page.dimensionFontSize)}
                  title={v.scaleSource === 'declared' ? 'Scale printed on the drawing' : v.scaleSource === 'measured' ? 'Scale measured from this view\'s dimension lines' : v.scaleSource === 'sheet' ? 'Scale of the sheet' : 'No scale found'}>
                  {v.name}{v.scaleText ? <span className="ml-1 tabular-nums text-muted-foreground">{v.scaleText}</span> : null}
                </button>
              ))}
            </div>
          )}
          {page?.grids && page.grids.length > 0 && (
            <Fact label="Tables" icon={<Table2 className="text-primary" />}>
              <button type="button" className={pill} aria-expanded={listed === 'tables'} onClick={() => setListed(listed === 'tables' ? null : 'tables')} data-testid="sheet-grids">{page.grids.length} · {listed === 'tables' ? 'hide' : 'list'}</button>
            </Fact>
          )}
          {listed === 'tables' && page?.grids && (
            <div className="flex flex-wrap gap-1 border-t bg-muted/30 px-3 py-2">
              {page.grids.map((g, i) => (
                <button key={i} type="button" className={pill} onClick={() => setShownGrid(g)}>
                  {g.kind === 'tolerance' ? 'Tolerance table' : g.kind === 'title_block' ? 'Title block' : g.kind === 'hole_table' ? 'Hole table' : 'Table'}
                  <span className="ml-1 tabular-nums text-muted-foreground">{g.rows.length} × {g.cols}</span>
                </button>
              ))}
            </div>
          )}
          {assist && ready && (
            <Fact label="AI reading" icon={<Sparkles className={assist.enabled ? 'text-primary' : 'text-muted-foreground'} />}>
              <span className={cn('rounded-full px-1.5 py-px text-[10px] font-semibold', assist.enabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')} title={assist.enabled ? assist.model : assist.reason}>{assist.enabled ? 'On' : 'Off'}</span>
              <button type="button" className="ml-1.5 text-primary underline-offset-2 hover:underline" onClick={() => setAssistOpen(true)} data-testid="assist-row">{assist.enabled ? 'Read a region' : 'What it does'}</button>
            </Fact>
          )}
          {stale && <p className="border-t px-3 py-2 text-[11px] text-status-draft">Read by an older recognizer version. Use Recognize again to refresh.</p>}
        </section>

        <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
          <kbd className="rounded border border-b-2 px-1 font-sans text-[10px]">J</kbd> next balloon · <kbd className="rounded border border-b-2 px-1 font-sans text-[10px]">A</kbd> accept · <kbd className="rounded border border-b-2 px-1 font-sans text-[10px]">B</kbd> then click a dimension to add one by hand
        </p>
      </div>
      <AssistDialog open={assistOpen} status={assist} onClose={() => setAssistOpen(false)} />
      <TableDialog grid={shownGrid} scheme={scheme} onClose={() => setShownGrid(null)} />
    </aside>
  )
}
