import { useEffect } from 'react'
import { CheckCheck, CircleAlert, CircleCheck, CircleX, LayoutGrid, Loader2, Ruler, ScanSearch, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { focusAt, openGroups, useRecognizeStore } from '@/store/recognizeStore'
import { balloonLabel, useCharacteristicStore } from '@/store/characteristicStore'
import { useDocumentStore } from '@/store/documentStore'
import { useSessionStore } from '@/store/sessionStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useUiStore, type MeasureFilter } from '@/store/uiStore'
import { deriveLimits, displayStatus, fmt } from '@/lib/tolerance'
import { progressOf } from '@/lib/progress'
import { cn } from '@/lib/utils'

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold text-muted-foreground">{children}</h3>
}

function Bar({ parts }: { parts: { value: number; className: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1
  return (
    <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted">
      {parts.map((p, i) => (
        <span key={i} className={p.className} style={{ width: `${(100 * p.value) / total}%` }} />
      ))}
    </div>
  )
}

function Row({ tone, text, hint, onClick, testId }: { tone: 'bad' | 'warn'; text: string; hint: string; onClick: () => void; testId?: string }) {
  return (
    <button type="button" onClick={onClick} data-testid={testId} className="flex w-full items-center gap-2 border-t px-2.5 py-2 text-left text-xs transition-colors first:border-t-0 hover:bg-accent">
      <span className={cn('size-2 shrink-0 rounded-full', tone === 'bad' ? 'bg-status-fail' : 'bg-status-draft')} />
      <span className="min-w-0 flex-1 truncate" title={text}>{text}</span>
      <span className="shrink-0 text-[11px] text-muted-foreground">{hint}</span>
    </button>
  )
}

/** Left panel: only what today's work needs. Settings live behind the gear. */
export function SidePanel() {
  const step = useUiStore((s) => s.step)
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen)
  const measureFilter = useUiStore((s) => s.measureFilter)
  const setMeasureFilter = useUiStore((s) => s.setMeasureFilter)
  const items = useCharacteristicStore((s) => s.items)
  const select = useCharacteristicStore((s) => s.select)
  const acceptAll = useCharacteristicStore((s) => s.acceptAll)
  const defaults = useSettingsStore((s) => s.defaults)
  const pageIndex = useDocumentStore((s) => s.pageIndex)
  const ready = useDocumentStore((s) => s.status === 'ready')
  const revisionId = useSessionStore((s) => s.revisionId)
  const page = useRecognizeStore((s) => s.pages[pageIndex])
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

  const p = progressOf(items, defaults)
  const running = status === 'running'
  const unreadable = intake?.level === 'bad'
  const needs = openGroups(page)
  const audit = page?.audit
  const autoDrafts = items.filter((c) => c.source === 'auto' && c.status === 'Draft').length
  const jump = (at: { x: number; y: number }, id?: string) => {
    focusAt(at.x, at.y, page?.dimensionFontSize ?? 12)
    if (id) select(items.some((c) => c.id === id) ? id : null)
  }
  const fails = items.filter((c) => displayStatus(c, deriveLimits(c, defaults)) === 'Fail')
  const scheme = defaults.scheme
  const toleranceNote = page?.tolerance?.findings.find((f) => f.level === 'warn' && !f.text.startsWith('Angular'))
  const attention = (audit?.mismatch.length ?? 0) + (audit?.noGeometry.length ?? 0) + (audit?.unexplained.length ?? 0) + needs.length

  return (
    <aside className="flex h-full flex-col gap-5 overflow-y-auto bg-background p-4" data-testid="side-panel">
      {step === 'review' ? (
        <section>
          <Heading>Review progress</Heading>
          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
            {p.accepted} <span className="text-sm font-normal text-muted-foreground">of {p.total} accepted</span>
          </p>
          <Bar parts={[{ value: p.accepted, className: 'bg-status-pass' }, { value: p.drafts, className: 'bg-muted-foreground/25' }]} />
        </section>
      ) : (
        <section>
          <Heading>Measure progress</Heading>
          <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
            {p.measured} <span className="text-sm font-normal text-muted-foreground">of {p.measurable} measured</span>
          </p>
          <Bar parts={[{ value: p.measured - p.fails, className: 'bg-status-pass' }, { value: p.fails, className: 'bg-status-fail' }, { value: p.measurable - p.measured, className: 'bg-muted-foreground/25' }]} />
          <ToggleGroup type="single" value={measureFilter} onValueChange={(v) => v && setMeasureFilter(v as MeasureFilter)} className="mt-3 w-full" aria-label="Rows shown in the grid">
            <ToggleGroupItem value="todo" className="flex-1 whitespace-nowrap">To do {p.measurable - p.measured}</ToggleGroupItem>
            <ToggleGroupItem value="failed" className="flex-1 whitespace-nowrap">Failed {p.fails}</ToggleGroupItem>
            <ToggleGroupItem value="all" className="flex-1 whitespace-nowrap">All {p.total}</ToggleGroupItem>
          </ToggleGroup>
        </section>
      )}

      {!page && (
        <section className="rounded-lg border border-dashed p-3 text-center">
          <p className="text-xs text-muted-foreground">{unreadable ? 'This sheet has no readable text. Balloon it by hand, or ask for a vector PDF export from CAD.' : 'Read the drawing to place balloons automatically.'}</p>
          <Button size="sm" className="mt-2.5 w-full gap-1.5" onClick={() => void run()} disabled={!ready || !revisionId || running || unreadable} data-testid="recognize-run">
            {running ? <Loader2 className="animate-spin" /> : <ScanSearch />} {running ? 'Reading…' : 'Recognize this sheet'}
          </Button>
          {error && <p className="mt-2 text-[11px] text-status-fail" role="alert">{error}</p>}
        </section>
      )}

      {step === 'review' && page && (
        <section>
          <Heading>Needs attention</Heading>
          {attention === 0 ? (
            <p className="mt-2 rounded-lg border px-2.5 py-2 text-xs text-status-pass">Every dimension line has a value, and every value has geometry.</p>
          ) : (
            <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border" data-testid="needs-attention">
              {audit?.mismatch.map((m) => (
                <Row key={m.id} tone="bad" text={`${m.specification} is drawn ${m.measured ?? '?'}`} hint="check" onClick={() => jump(m.at, m.id)} />
              ))}
              {audit?.noGeometry.map((m) => (
                <Row key={m.id} tone="warn" text={`${m.specification}: no line or leader`} hint="check" onClick={() => jump(m.at, m.id)} />
              ))}
              {audit?.unexplained.map((u, i) => (
                <Row key={`u${i}`} tone="warn" text="Dimension line without a value" hint="look" onClick={() => jump(u.at)} />
              ))}
              {needs.map((g) => (
                <Row
                  key={g.guess.id}
                  tone="warn"
                  testId="needs-you-row"
                  text={g.guess.descriptionType === 'Note' ? `${g.guess.comments}: ${g.guess.specification}` : g.guess.specification || g.tokens.map((t) => t.text).join(' ')}
                  hint="add"
                  onClick={() => adopt(g.guess.id)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {step === 'measure' && (
        <section>
          <Heading>Nonconforming</Heading>
          {fails.length === 0 ? (
            <p className="mt-2 rounded-lg border px-2.5 py-2 text-xs text-muted-foreground">No result is out of tolerance.</p>
          ) : (
            <div className="mt-2 max-h-60 overflow-y-auto rounded-lg border">
              {fails.map((c) => (
                <Row key={c.id} tone="bad" text={`${balloonLabel(c)} · ${c.specification} measured ${typeof c.result === 'number' ? fmt(c.result, c.places) : c.result}`} hint="open" onClick={() => jump(c.anchor, c.id)} />
              ))}
            </div>
          )}
        </section>
      )}

      <section>
        <Heading>Sheet</Heading>
        <ul className="mt-2 space-y-1.5 text-xs">
          {intake && (
            <li className="flex items-start gap-2">
              {intake.level === 'ok' ? <CircleCheck className="mt-px size-3.5 shrink-0 text-status-pass" /> : intake.level === 'warn' ? <CircleAlert className="mt-px size-3.5 shrink-0 text-status-draft" /> : <CircleX className="mt-px size-3.5 shrink-0 text-status-fail" />}
              <span title={intake.pages[0]?.rows.map((r) => `${r.label}: ${r.value}`).join('\n')}>{intake.verdict}</span>
            </li>
          )}
          <li className="flex items-start gap-2">
            <Ruler className={cn('mt-px size-3.5 shrink-0', scheme ? 'text-status-pass' : 'text-status-draft')} />
            <span>
              {scheme ? (
                <>General tolerance <span className="font-medium">{scheme.label}</span>{scheme.verifiedAgainstSheet ? ', table on the sheet agrees' : ''}</>
              ) : (
                <>General tolerance by decimal places{toleranceNote ? `. ${toleranceNote.text}` : ''}</>
              )}{' '}
              <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => setSettingsOpen(true)}>Change</button>
            </span>
          </li>
          {audit && (
            <li className="flex items-start gap-2">
              <CircleCheck className="mt-px size-3.5 shrink-0 text-status-pass" />
              <span>{audit.verified} values agree with their dimension line{audit.scales.length > 1 ? `, ${audit.scales.length} view scales` : ''}</span>
            </li>
          )}
          {page?.views && page.views.length > 0 && (
            <li className="flex items-start gap-2" data-testid="sheet-views">
              <LayoutGrid className="mt-px size-3.5 shrink-0 text-primary" />
              <span>
                {page.views.length} {page.views.length === 1 ? 'view' : 'views'}
                <span className="mt-1 flex flex-wrap gap-1">
                  {page.views.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => focusAt(v.bbox.x + v.bbox.w / 2, v.bbox.y + v.bbox.h / 2, page.dimensionFontSize)}
                      title={v.scaleSource === 'declared' ? 'Scale printed on the drawing' : v.scaleSource === 'measured' ? 'Scale measured from this view\'s dimension lines' : v.scaleSource === 'sheet' ? 'Scale of the sheet' : 'No scale found'}
                      className="rounded border px-1.5 py-0.5 text-[11px] transition-colors hover:border-primary hover:bg-primary/5"
                    >
                      {v.name}{v.scaleText ? <span className="ml-1 tabular-nums text-muted-foreground">{v.scaleText}</span> : null}
                    </button>
                  ))}
                </span>
              </span>
            </li>
          )}
          {stale && <li className="text-status-draft">Read by an older recognizer version. Recognize again to refresh.</li>}
        </ul>
      </section>

      <div className="mt-auto space-y-2">
        {step === 'review' && autoDrafts > 0 && (
          <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => { acceptAll(); select(null) }} data-testid="accept-all">
            <CheckCheck /> Accept {autoDrafts} reviewed drafts
          </Button>
        )}
        <Button size="sm" variant="ghost" className="w-full justify-start gap-1.5 text-muted-foreground" onClick={() => setSettingsOpen(true)}>
          <Settings2 /> Inspection settings
        </Button>
      </div>
    </aside>
  )
}
