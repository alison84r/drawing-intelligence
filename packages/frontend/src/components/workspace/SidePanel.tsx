import { useEffect, useState } from 'react'
import {
  Check, CheckCheck, ChevronRight, CircleAlert, CircleCheck, CircleX, FileText, Flag, LayoutGrid, Lightbulb, Loader2, Plus, Ruler, ScanSearch, Settings2, Sparkles, Table2, ZoomIn,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { focusAt, openGroups, useRecognizeStore } from '@/store/recognizeStore'
import { balloonLabel, useCharacteristicStore, type Characteristic } from '@/store/characteristicStore'
import { useDocumentStore } from '@/store/documentStore'
import { useSessionStore } from '@/store/sessionStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useUiStore } from '@/store/uiStore'
import { fmt, requirementText, deriveLimits } from '@/lib/tolerance'
import { byBalloon, issueOf, progressOf, workStateOf } from '@/lib/progress'
import { cn } from '@/lib/utils'
import { api, type AssistStatus, type SheetGrid } from '@/lib/api'
import { AssistDialog } from '@/components/assist/AssistDialog'
import { TableDialog } from './TableDialog'

/** Share of the job that is confirmed, as a ring. */
function Ring({ value }: { value: number }) {
  const r = 21
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 54 54" className="size-[54px] shrink-0" role="img" aria-label={`${value} percent confirmed`}>
      <circle cx="27" cy="27" r={r} fill="none" strokeWidth="6" className="stroke-muted" />
      <circle cx="27" cy="27" r={r} fill="none" strokeWidth="6" strokeLinecap="round" className="stroke-status-pass transition-[stroke-dashoffset] duration-500" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} transform="rotate(-90 27 27)" />
      <text x="27" y="31" textAnchor="middle" className="fill-foreground text-[12px] font-bold tabular-nums">{value}%</text>
    </svg>
  )
}

/** A group in the queue: opens and closes, shows its count even when closed. */
function Group({ id, icon, title, count, tone, defaultOpen, children }: { id: string; icon: React.ReactNode; title: string; count: React.ReactNode; tone: 'bad' | 'warn' | 'ok' | 'plain'; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  return (
    <section className="shrink-0 overflow-hidden rounded-lg border bg-background" data-testid={`group-${id}`} data-open={open}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="flex w-full items-center gap-2 bg-muted/50 px-2.5 py-2 text-left text-xs font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring [&_svg]:size-3.5 [&_svg]:shrink-0">
        <ChevronRight className={cn('text-muted-foreground transition-transform', open && 'rotate-90')} />
        {icon}
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <span className={cn(
          'rounded-full px-2 py-px text-[11px] font-semibold tabular-nums',
          tone === 'bad' && 'bg-status-fail/15 text-status-fail',
          tone === 'warn' && 'bg-status-draft/15 text-status-draft',
          tone === 'ok' && 'bg-status-pass/15 text-status-pass',
          tone === 'plain' && 'border text-muted-foreground',
        )}>{count}</span>
      </button>
      {open && <div>{children}</div>}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="border-t px-2.5 py-2.5 text-[11px] leading-snug text-muted-foreground">{children}</p>
}

/** One problem: which balloon, what it says, what is wrong. Click it and the sheet goes there. */
function IssueRow({ c, text, detail, selected, tone, onOpen, onAccept }: { c: Characteristic; text: string; detail: string; selected: boolean; tone: 'bad' | 'warn'; onOpen: () => void; onAccept?: () => void }) {
  return (
    <div className={cn('group/row flex items-center gap-2 border-t px-2.5 py-2 transition-colors hover:bg-accent/60', selected && 'bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))]')} data-testid="issue-row" data-selected={selected || undefined}>
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2.5 text-left focus-visible:outline-none">
        <span className={cn('grid size-6 shrink-0 place-items-center rounded-full border-[1.6px] text-[10px] font-bold tabular-nums', tone === 'bad' ? 'border-status-fail text-status-fail' : 'border-dashed border-status-draft text-status-draft')}>{balloonLabel(c)}</span>
        <span className="min-w-0">
          <span className="block truncate text-xs font-semibold tabular-nums">{text}</span>
          <span className="block truncate text-[11px] text-muted-foreground" title={detail}>{detail}</span>
        </span>
      </button>
      <span className="flex shrink-0 items-center opacity-60 transition-opacity group-hover/row:opacity-100">
        <Tooltip><TooltipTrigger asChild>
          <button type="button" onClick={onOpen} aria-label="Zoom to it on the sheet" className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-background hover:text-foreground"><ZoomIn className="size-3.5" /></button>
        </TooltipTrigger><TooltipContent>Zoom to it on the sheet</TooltipContent></Tooltip>
        {onAccept && (
          <Tooltip><TooltipTrigger asChild>
            <button type="button" onClick={onAccept} aria-label="Accept as printed" className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-background hover:text-status-pass"><Check className="size-3.5" /></button>
          </TooltipTrigger><TooltipContent>Accept as printed</TooltipContent></Tooltip>
        )}
      </span>
    </div>
  )
}

function Fact({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[auto_auto_1fr] items-start gap-x-2 border-t px-2.5 py-2 text-xs [&>svg]:mt-px [&>svg]:size-3.5 [&>svg]:shrink-0">
      {icon}
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right font-medium">{children}</span>
    </div>
  )
}

const pill = 'rounded-full border px-2 py-px text-[11px] font-medium transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

/** Left panel: a work queue. What needs a decision, what could be added, and the facts about this sheet. */
export function SidePanel() {
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen)
  const items = useCharacteristicStore((s) => s.items)
  const selectedId = useCharacteristicStore((s) => s.selectedId)
  const select = useCharacteristicStore((s) => s.select)
  const acceptIds = useCharacteristicStore((s) => s.acceptIds)
  const defaults = useSettingsStore((s) => s.defaults)
  const pageIndex = useDocumentStore((s) => s.pageIndex)
  const setPageIndex = useDocumentStore((s) => s.setPageIndex)
  const ready = useDocumentStore((s) => s.status === 'ready')
  const revisionId = useSessionStore((s) => s.revisionId)
  const page = useRecognizeStore((s) => s.pages[pageIndex])
  const pages = useRecognizeStore((s) => s.pages)
  const status = useRecognizeStore((s) => s.status)
  const error = useRecognizeStore((s) => s.error)
  const stale = useRecognizeStore((s) => s.stale)
  const run = useRecognizeStore((s) => s.run)
  const adopt = useRecognizeStore((s) => s.adopt)
  const intake = useRecognizeStore((s) => s.intake)
  const loadIntake = useRecognizeStore((s) => s.loadIntake)

  useEffect(() => {
    if (revisionId && ready) void loadIntake(revisionId)
  }, [revisionId, ready, loadIntake])

  const [assist, setAssist] = useState<AssistStatus | null>(null)
  const [assistOpen, setAssistOpen] = useState(false)
  const [shownGrid, setShownGrid] = useState<SheetGrid | null>(null)
  const [listed, setListed] = useState<'views' | 'tables' | null>(null)
  useEffect(() => {
    api.assistStatus().then(setAssist).catch(() => setAssist(null))
  }, [])

  const p = progressOf(items, defaults)
  const running = status === 'running'
  const unreadable = intake?.level === 'bad'
  const sorted = [...items].sort(byBalloon)
  const flagged = sorted.filter((c) => workStateOf(c, defaults) === 'flagged')
  const failed = sorted.filter((c) => workStateOf(c, defaults) === 'fail')
  const clean = sorted.filter((c) => workStateOf(c, defaults) === 'check')
  const suggestions = openGroups(page)
  const orphans = page?.audit?.unexplained ?? []
  const decisions = flagged.length + failed.length + orphans.length
  const scheme = defaults.scheme
  const toleranceNote = page?.tolerance?.findings.find((f) => f.level === 'warn' && !f.text.startsWith('Angular'))
  const percent = p.total === 0 ? 0 : Math.round((100 * p.accepted) / p.total)

  /** Select the balloon and bring it up large enough to read. The selected balloon pulses on the sheet. */
  const open = (c: Characteristic) => {
    if (c.page !== pageIndex) setPageIndex(c.page)
    select(c.id)
    const at = c.obox ? { x: c.obox.cx, y: c.obox.cy } : c.bbox ? { x: c.bbox.x + c.bbox.w / 2, y: c.bbox.y + c.bbox.h / 2 } : c.anchor
    focusAt(at.x, at.y, (pages[c.page]?.dimensionFontSize ?? 12) * 0.6)
  }

  return (
    <aside className="flex h-full flex-col gap-3 overflow-y-auto bg-sidebar p-3" data-testid="side-panel">
      <section className="flex shrink-0 items-center gap-3 px-1 pt-1" data-testid="queue-progress">
        <Ring value={percent} />
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold tabular-nums leading-tight">
            {p.accepted} <span className="text-xs font-medium text-muted-foreground">of {p.total} confirmed</span>
          </p>
          <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-muted">
            {[
              { n: p.passed, cls: 'bg-status-pass' }, { n: p.fails, cls: 'bg-status-fail' }, { n: p.accepted - p.passed - p.fails, cls: 'bg-status-pass/45' },
              { n: p.flagged, cls: 'bg-status-fail/60' }, { n: p.drafts - p.flagged, cls: 'bg-muted-foreground/25' },
            ].map((b, i) => <span key={i} className={b.cls} style={{ width: `${p.total ? (100 * b.n) / p.total : 0}%` }} />)}
          </div>
          <p className="mt-1.5 flex flex-wrap gap-x-2.5 text-[11px] tabular-nums text-muted-foreground">
            {p.flagged > 0 && <span><i className="mr-1 inline-block size-1.5 rounded-full bg-status-fail align-middle" />{p.flagged} flagged</span>}
            <span><i className="mr-1 inline-block size-1.5 rounded-full bg-muted-foreground/40 align-middle" />{p.drafts - p.flagged} waiting</span>
            {p.measurable > 0 && <span>{p.measured} of {p.measurable} measured</span>}
          </p>
        </div>
      </section>

      {!page && items.length === 0 && (
        <section className="shrink-0 rounded-lg border border-dashed p-3 text-center">
          <p className="text-xs text-muted-foreground">{unreadable ? 'This sheet has no readable text. Balloon it by hand, or ask for a vector PDF export from CAD.' : 'Read the drawing to place balloons automatically.'}</p>
          <Button size="sm" className="mt-2.5 w-full gap-1.5" onClick={() => void run()} disabled={!ready || !revisionId || running || unreadable} data-testid="recognize-run">
            {running ? <Loader2 className="animate-spin" /> : <ScanSearch />} {running ? 'Reading…' : 'Recognize this sheet'}
          </Button>
          {error && <p className="mt-2 text-[11px] text-status-fail" role="alert">{error}</p>}
        </section>
      )}

      <Group id="decisions" icon={<Flag className="text-status-fail" />} title="Needs a decision" count={decisions} tone={decisions > 0 ? 'bad' : 'ok'} defaultOpen>
        {decisions === 0 && <Empty>Nothing is flagged. {p.drafts > 0 ? 'The rest only needs a look: accept them one by one, or all at once below.' : p.toMeasure > 0 ? 'Next: enter the measured values.' : 'This inspection is ready to export.'}</Empty>}
        {failed.map((c) => (
          <IssueRow key={c.id} c={c} tone="bad" selected={c.id === selectedId} onOpen={() => open(c)}
            text={requirementText(c, deriveLimits(c, defaults)) || c.specification}
            detail={`Measured ${typeof c.result === 'number' ? fmt(c.result, c.places) : c.result}, outside the limits`} />
        ))}
        {flagged.map((c) => (
          <IssueRow key={c.id} c={c} tone="bad" selected={c.id === selectedId} onOpen={() => open(c)} onAccept={() => acceptIds([c.id])}
            text={c.specification} detail={issueOf(c) ?? ''} />
        ))}
        {orphans.map((u, i) => (
          <button key={`o${i}`} type="button" onClick={() => focusAt(u.at.x, u.at.y, (page?.dimensionFontSize ?? 12) * 0.6)}
            className="flex w-full items-center gap-2.5 border-t px-2.5 py-2 text-left transition-colors hover:bg-accent/60" data-testid="orphan-row">
            <span className="grid size-6 shrink-0 place-items-center rounded-full border-[1.6px] border-dashed border-status-draft text-status-draft"><Ruler className="size-3" /></span>
            <span className="min-w-0"><span className="block text-xs font-semibold">A dimension line has no value</span><span className="block text-[11px] text-muted-foreground">Look at it; add a balloon by hand if one is missing</span></span>
          </button>
        ))}
      </Group>

      <Group id="suggestions" icon={<Lightbulb className="text-status-draft" />} title="Suggested to add" count={suggestions.length} tone={suggestions.length > 0 ? 'warn' : 'plain'} defaultOpen={suggestions.length > 0 && suggestions.length <= 6}>
        {suggestions.length === 0 && <Empty>Nothing was left unplaced on this sheet.</Empty>}
        {suggestions.map((g) => (
          <div key={g.guess.id} className="flex items-center gap-2 border-t px-2.5 py-2" data-testid="needs-you-row">
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => focusAt(g.guess.anchor.x, g.guess.anchor.y, (page?.dimensionFontSize ?? 12) * 0.6)}>
              <span className="block truncate text-xs font-semibold" title={g.guess.specification}>{g.guess.specification || g.tokens.map((t) => t.text).join(' ')}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{g.guess.descriptionType === 'Note' ? 'A drawing note. Add it if it is inspected' : g.tokens[0]?.reason || 'Read with low confidence'}</span>
            </button>
            <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[11px]" onClick={() => adopt(g.guess.id)}><Plus className="size-3" /> Add</Button>
          </div>
        ))}
      </Group>

      <Group id="sheet" icon={<FileText className="text-primary" />} title="About this sheet" tone={intake?.level === 'bad' ? 'bad' : intake?.level === 'warn' || !scheme || stale ? 'warn' : 'ok'}
        count={intake?.level === 'bad' ? 'Not readable' : intake?.level === 'warn' || !scheme || stale ? 'Check' : 'All good'}>
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
        {page?.audit && (
          <Fact label="Lengths" icon={<CircleCheck className="text-status-pass" />}>{page.audit.verified} agree with their dimension line</Fact>
        )}
        {page?.views && page.views.length > 0 && (
          <Fact label="Views" icon={<LayoutGrid className="text-primary" />}>
            <button type="button" className={pill} aria-expanded={listed === 'views'} onClick={() => setListed(listed === 'views' ? null : 'views')} data-testid="sheet-views">{page.views.length} · {listed === 'views' ? 'hide' : 'list'}</button>
          </Fact>
        )}
        {listed === 'views' && page?.views && (
          <div className="flex flex-wrap gap-1 border-t bg-muted/30 px-2.5 py-2">
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
          <div className="flex flex-wrap gap-1 border-t bg-muted/30 px-2.5 py-2">
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
        {stale && <Empty>Read by an older recognizer version. Use Recognize again to refresh.</Empty>}
      </Group>

      <div className="mt-auto space-y-1.5 pt-1">
        {clean.length > 0 && (
          <Tooltip><TooltipTrigger asChild>
            <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => { acceptIds(clean.map((c) => c.id)); select(null) }} data-testid="accept-all">
              <CheckCheck /> Accept the {clean.length} without flags
            </Button>
          </TooltipTrigger><TooltipContent>Confirms every balloon whose checks passed. Flagged ones stay for you. One undo step.</TooltipContent></Tooltip>
        )}
        <Button size="sm" variant="ghost" className="w-full justify-start gap-1.5 text-muted-foreground" onClick={() => setSettingsOpen(true)}>
          <Settings2 /> Inspection settings
        </Button>
      </div>
      <AssistDialog open={assistOpen} status={assist} onClose={() => setAssistOpen(false)} />
      <TableDialog grid={shownGrid} scheme={scheme} onClose={() => setShownGrid(null)} />
    </aside>
  )
}
