import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, FileText, Flag, Ruler, Search, X, ZoomIn } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Fcf } from '@/components/gdt/Fcf'
import { WorkBadge } from '@/components/status/WorkBadge'
import { focusAt, useRecognizeStore } from '@/store/recognizeStore'
import { balloonLabel, useCharacteristicStore, type Characteristic } from '@/store/characteristicStore'
import { useDocumentStore } from '@/store/documentStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useUiStore } from '@/store/uiStore'
import { deriveLimits, fmt, requirementText } from '@/lib/tolerance'
import { byBalloon, issueOf, matchesFilter, progressOf, workStateOf, type WorkFilter, type WorkState } from '@/lib/progress'
import { cn } from '@/lib/utils'
import { Empty, Group } from './parts'

const NUMBER_RING: Record<WorkState, string> = {
  check: 'border-dashed border-[#1d4ed8] text-[#1d4ed8] dark:border-[#93c5fd] dark:text-[#93c5fd]',
  flagged: 'border-status-fail text-status-fail',
  measure: 'border-[#1d4ed8] text-[#1d4ed8] dark:border-[#93c5fd] dark:text-[#93c5fd]',
  done: 'border-status-pass text-status-pass',
  pass: 'border-status-pass bg-status-pass text-white',
  fail: 'border-status-fail bg-status-fail text-white',
}

/** The chips that choose which part of the list is on screen. The counts are the job at a glance. */
function Chips() {
  const items = useCharacteristicStore((s) => s.items)
  const defaults = useSettingsStore((s) => s.defaults)
  const show = useUiStore((s) => s.show)
  const setShow = useUiStore((s) => s.setShow)
  const p = progressOf(items, defaults)
  const chips: { value: WorkFilter; label: string; count: number; dot?: string; hint: string }[] = [
    { value: 'all', label: 'All', count: p.total, hint: 'Every balloon on this inspection' },
    { value: 'flagged', label: 'Flagged', count: p.flagged, dot: 'bg-status-fail', hint: 'A check failed: these need a decision' },
    { value: 'check', label: 'To check', count: p.drafts, dot: 'bg-[#1d4ed8]', hint: 'Read from the drawing and not confirmed yet' },
    { value: 'measure', label: 'To measure', count: p.toMeasure, dot: 'bg-status-draft', hint: 'Confirmed, waiting for a measured value' },
    { value: 'pass', label: 'Passed', count: p.passed, dot: 'bg-status-pass', hint: 'Measured, inside the limits' },
    { value: 'fail', label: 'Failed', count: p.fails, dot: 'bg-status-fail', hint: 'Measured, outside the limits' },
  ]
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Which balloons to list" data-testid="filter-bar">
      {chips.filter((c) => c.count > 0 || c.value === 'all' || c.value === show).map((c) => (
        <Tooltip key={c.value}>
          <TooltipTrigger asChild>
            <button type="button" aria-pressed={show === c.value} data-testid={`show-${c.value}`} onClick={() => setShow(show === c.value ? 'all' : c.value)}
              className={cn(
                'inline-flex h-[22px] items-center gap-1 rounded-full border bg-background px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                show === c.value && 'border-primary bg-primary text-primary-foreground hover:text-primary-foreground',
              )}>
              {c.dot && <span className={cn('size-1.5 rounded-full', show === c.value ? 'bg-primary-foreground' : c.dot)} />}
              {c.label}
              <span className={cn('font-semibold tabular-nums', show === c.value ? 'text-primary-foreground' : 'text-foreground')}>{c.count}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>{c.hint}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}

/** One balloon in the list. A sub-row of a callout (24.1) steps in under its balloon. */
function Row({ c, state, text, detail, selected, onSelect, onZoom, onAccept, features, alone }: {
  c: Characteristic
  state: WorkState
  text: string
  detail?: string
  selected: boolean
  onSelect: () => void
  onZoom: () => void
  onAccept?: () => void
  features?: number
  /** Listed without its balloon above it (a search hit, a filtered list): it carries its full number. */
  alone?: boolean
}) {
  const sub = c.subNumber !== null && !alone
  return (
    <div
      className={cn('group/row flex items-center gap-1.5 border-t py-1 pr-1.5 transition-colors hover:bg-accent/60', sub ? 'pl-7' : 'pl-2', selected && 'bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))]')}
      data-testid="work-row" data-id={c.id} data-selected={selected || undefined} data-state={state}
    >
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none">
        <span className={cn('grid h-[22px] min-w-[22px] shrink-0 place-items-center rounded-full border-[1.6px] px-1 text-[10px] font-bold tabular-nums', NUMBER_RING[state], sub && 'h-5 min-w-5 text-[9.5px]')}>
          {sub ? `.${c.subNumber}` : balloonLabel(c)}
        </span>
        <span className="min-w-0">
          <span className={cn('flex items-center gap-1.5 text-xs tabular-nums', sub ? 'font-medium' : 'font-semibold')}>
            {c.toleranceType === 'GD&T' && c.gdt ? <Fcf gdt={c.gdt} size="sm" /> : <span className="truncate">{text}</span>}
          </span>
          {detail && <span className="block truncate text-[11px] text-muted-foreground" title={detail}>{detail}</span>}
          {!detail && features ? <span className="block truncate text-[10.5px] text-muted-foreground">Callout · {features + 1} features</span> : null}
        </span>
      </button>
      <span className="hidden shrink-0 items-center group-hover/row:flex">
        <Tooltip><TooltipTrigger asChild>
          <button type="button" onClick={onZoom} aria-label="Zoom to it on the sheet" className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-background hover:text-foreground"><ZoomIn className="size-3.5" /></button>
        </TooltipTrigger><TooltipContent>Zoom to it on the sheet</TooltipContent></Tooltip>
        {onAccept && (
          <Tooltip><TooltipTrigger asChild>
            <button type="button" onClick={onAccept} aria-label="Accept as printed" className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-background hover:text-status-pass"><Check className="size-3.5" /></button>
          </TooltipTrigger><TooltipContent>Accept as printed</TooltipContent></Tooltip>
        )}
      </span>
      {c.subNumber === null && <WorkBadge state={state} className="h-[18px] shrink-0 px-1.5 text-[10px] group-hover/row:hidden [&_svg]:size-2.5" />}
    </div>
  )
}

/**
 * The work list: every balloon of the inspection, problems first, then sheet by sheet and view by view.
 * One search box, one set of chips. Clicking a row selects the balloon and brings its sheet up.
 */
export function WorkList() {
  const items = useCharacteristicStore((s) => s.items)
  const selectedId = useCharacteristicStore((s) => s.selectedId)
  const select = useCharacteristicStore((s) => s.select)
  const acceptIds = useCharacteristicStore((s) => s.acceptIds)
  const defaults = useSettingsStore((s) => s.defaults)
  const show = useUiStore((s) => s.show)
  const pageIndex = useDocumentStore((s) => s.pageIndex)
  const pageCount = useDocumentStore((s) => s.pageCount)
  const setPageIndex = useDocumentStore((s) => s.setPageIndex)
  const pages = useRecognizeStore((s) => s.pages)
  const [query, setQuery] = useState('')
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  const listRef = useRef<HTMLDivElement>(null)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...items].sort((a, b) => a.page - b.page || byBalloon(a, b)).map((c) => {
      const state = workStateOf(c, defaults)
      const text = requirementText(c, deriveLimits(c, defaults)) || c.specification || 'No requirement yet'
      const label = balloonLabel(c)
      const hit = !q || label === q || label.startsWith(`${q}.`) || text.toLowerCase().includes(q) || c.specification.toLowerCase().includes(q)
      return { c, state, text, shown: hit && matchesFilter(state, show) }
    })
  }, [items, defaults, show, query])

  const shown = rows.filter((r) => r.shown)
  const decisions = show === 'all' && !query.trim() ? shown.filter((r) => r.state === 'flagged' || r.state === 'fail') : []
  const orphans = show === 'all' && !query.trim() ? pages[pageIndex]?.audit?.unexplained ?? [] : []

  // Sheet by sheet, and inside a sheet view by view, in the order the balloons run.
  const groups = useMemo(() => {
    const out: { key: string; sheet: number; title: string; rows: typeof shown }[] = []
    for (const r of shown) {
      const head = r.c.subNumber === null ? r.c : items.find((o) => o.page === r.c.page && o.balloonNumber === r.c.balloonNumber && o.subNumber === null) ?? r.c
      const view = head.view || ''
      const key = `${r.c.page}|${view}`
      let g = out.find((o) => o.key === key)
      if (!g) {
        const sheet = pageCount > 1 ? `Sheet ${r.c.page + 1}` : ''
        out.push((g = { key, sheet: r.c.page, title: [sheet, view || (sheet ? '' : 'Balloons')].filter(Boolean).join(' · ') || 'Balloons', rows: [] }))
      }
      g.rows.push(r)
    }
    return out
  }, [shown, items, pageCount])

  const go = (c: Characteristic) => {
    if (c.page !== pageIndex) setPageIndex(c.page)
    select(c.id)
  }
  /** Select the balloon and bring it up large enough to read. */
  const zoom = (c: Characteristic) => {
    go(c)
    const at = c.obox ? { x: c.obox.cx, y: c.obox.cy } : c.bbox ? { x: c.bbox.x + c.bbox.w / 2, y: c.bbox.y + c.bbox.h / 2 } : c.anchor
    focusAt(at.x, at.y, (pages[c.page]?.dimensionFontSize ?? 12) * 0.6)
  }

  // The group that holds the selection opens, and the selected row comes into view.
  const selectedKey = groups.find((g) => g.rows.some((r) => r.c.id === selectedId))?.key
  useEffect(() => {
    if (!selectedId) return
    const t = window.setTimeout(() => listRef.current?.querySelector(`[data-testid="work-row"][data-id="${selectedId}"]`)?.scrollIntoView({ block: 'nearest' }), 0)
    return () => window.clearTimeout(t)
  }, [selectedId, selectedKey])

  const searching = query.trim() !== '' || show !== 'all'
  const isOpen = (key: string, sheet: number) => toggled[key] ?? (searching || sheet === pageIndex || key === selectedKey)

  const features = (c: Characteristic) => (c.subNumber === null ? items.filter((o) => o.page === c.page && o.balloonNumber === c.balloonNumber && o.subNumber !== null).length : 0)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" data-testid="work-list">
      <div className="relative shrink-0">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur() } }}
          placeholder="Find a number or a value" aria-label="Find a balloon by number or value" className="h-7 bg-background pl-7 pr-7" data-testid="work-find" />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="Clear" className="absolute right-1 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
        )}
      </div>
      <div className="shrink-0"><Chips /></div>

      <div ref={listRef} className="-mx-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1 pb-1">
        {(decisions.length > 0 || orphans.length > 0) && (
          <Group id="decisions" icon={<Flag className="text-status-fail" />} title="Needs a decision" count={decisions.length + orphans.length} tone="bad" defaultOpen>
            {decisions.map(({ c, state, text }) => (
              <Row key={c.id} c={c} state={state} selected={c.id === selectedId} onSelect={() => zoom(c)} onZoom={() => zoom(c)}
                onAccept={state === 'flagged' ? () => acceptIds([c.id]) : undefined}
                text={state === 'flagged' ? c.specification : text}
                detail={state === 'flagged' ? issueOf(c) ?? '' : `Measured ${typeof c.result === 'number' ? fmt(c.result, c.places) : c.result}, outside the limits`} />
            ))}
            {orphans.map((u, i) => (
              <button key={`o${i}`} type="button" onClick={() => focusAt(u.at.x, u.at.y, (pages[pageIndex]?.dimensionFontSize ?? 12) * 0.6)}
                className="flex w-full items-center gap-2 border-t px-2 py-1.5 text-left transition-colors hover:bg-accent/60" data-testid="orphan-row">
                <span className="grid size-[22px] shrink-0 place-items-center rounded-full border-[1.6px] border-dashed border-status-draft text-status-draft"><Ruler className="size-3" /></span>
                <span className="min-w-0"><span className="block text-xs font-semibold">A dimension line has no value</span><span className="block truncate text-[11px] text-muted-foreground">Look at it; add a balloon by hand if one is missing</span></span>
              </button>
            ))}
          </Group>
        )}

        {groups.map((g) => {
          const bad = g.rows.filter((r) => r.state === 'flagged' || r.state === 'fail').length
          const open = isOpen(g.key, g.sheet)
          return (
            <Group key={g.key} id={`view-${g.key}`} icon={<FileText className="text-primary" />} title={g.title} tone={bad ? 'bad' : 'plain'}
              count={bad ? `${bad} of ${g.rows.length}` : g.rows.length} open={open} onToggle={(v) => setToggled((t) => ({ ...t, [g.key]: v }))}>
              {g.rows.map(({ c, state, text }, i) => (
                <Row key={c.id} c={c} state={state} text={text} selected={c.id === selectedId} onSelect={() => go(c)} onZoom={() => zoom(c)}
                  alone={c.subNumber !== null && g.rows[i - 1]?.c.balloonNumber !== c.balloonNumber}
                  onAccept={state === 'flagged' || state === 'check' ? () => acceptIds([c.id]) : undefined} features={features(c)} />
              ))}
            </Group>
          )
        })}

        {items.length > 0 && shown.length === 0 && (
          <section className="rounded-lg border bg-background"><Empty>{query.trim() ? `Nothing matches "${query.trim()}".` : 'Nothing in this state.'} Clear the search or pick "All".</Empty></section>
        )}
      </div>
    </div>
  )
}
