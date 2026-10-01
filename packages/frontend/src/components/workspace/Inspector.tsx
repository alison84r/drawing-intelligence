import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, ChevronLeft, ChevronRight, CircleAlert, Info, MoreHorizontal, MousePointerClick, Palette, RotateCcw, Spline, Trash2, X, ZoomIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { FcfBuilder } from '@/components/gdt/FcfBuilder'
import { Fcf } from '@/components/gdt/Fcf'
import { BalloonStyleEditor } from '@/components/balloons/BalloonStyleEditor'
import { WorkBadge } from '@/components/status/WorkBadge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CommitInput, CommitTextarea, Field } from '@/components/inspector/fields'
import {
  balloonLabel,
  EMPTY_GDT,
  useCharacteristicStore,
  type Characteristic,
  type Designator,
  type DescriptionType,
  type MeasurementType,
  type ToleranceType,
  type Units,
} from '@/store/characteristicStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useUiStore } from '@/store/uiStore'
import { useSessionStore } from '@/store/sessionStore'
import { api } from '@/lib/api'
import { toggleZoomTo } from '@/lib/focus'
import { acceptSelectedAndNext, selectRelative } from '@/lib/workflow'
import { deriveLimits, displayStatus, fmt, hasNumericTolerance, limitPlaces, parseNumber, placesOf, requirementText } from '@/lib/tolerance'
import { visibleItems, workStateOf } from '@/lib/progress'
import { cn } from '@/lib/utils'

const DESCRIPTIONS: DescriptionType[] = [
  'Linear', 'Diameter', 'Radius', 'Angular', 'Chamfer', 'Thread', 'Surface Finish',
  'Flatness', 'Position', 'Perpendicularity', 'Parallelism', 'Profile', 'Runout', 'Concentricity', 'Note', 'Other',
]
const TOL_TYPES: ToleranceType[] = ['Bilateral', 'Unilateral', 'Limits', 'Basic', 'Reference', 'GD&T', 'Attribute']
const GEOMETRIC = new Set<DescriptionType>(['Flatness', 'Position', 'Perpendicularity', 'Parallelism', 'Profile', 'Runout', 'Concentricity'])

const numText = (n: number | null, places: number) => (n === null ? '' : fmt(n, places))

function symbolFor(d: DescriptionType): string {
  switch (d) {
    case 'Flatness': return '⏥'
    case 'Perpendicularity': return '⟂'
    case 'Parallelism': return '∥'
    case 'Profile': return '⌓'
    case 'Runout': return '↗'
    case 'Concentricity': return '◎'
    default: return '⌖'
  }
}

/** One line on what ties this callout to the drawing. */
function evidence(c: Characteristic): { text: string; tone: 'ok' | 'warn' | 'bad' | 'plain' } {
  const g = c.geometry
  if (c.descriptionType === 'Note') return { text: 'Drawing note, inspected as an attribute', tone: 'plain' }
  if (c.source !== 'auto') return { text: 'Placed by hand', tone: 'plain' }
  if (!g) return { text: 'No dimension line or leader found for this text', tone: 'warn' }
  if (g.ratioOk === false) return { text: `The line is drawn ${g.measured ?? '?'} long at sheet scale; the printed value differs`, tone: 'bad' }
  if (g.kind === 'dimension') return g.ratioOk ? { text: 'Drawn length agrees with the value', tone: 'ok' } : { text: 'On a dimension line', tone: 'plain' }
  if (g.kind === 'angular') return g.ratioOk ? { text: `Arrowheads span ${g.measured}°, agrees with the value`, tone: 'ok' } : { text: 'Tied to angular arrowheads', tone: 'plain' }
  if (g.kind === 'leader') return { text: 'Tied to a leader', tone: 'plain' }
  return { text: 'Shares the geometry of the callout next to it', tone: 'plain' }
}

/** A part of the panel that opens and closes. The hint says what is inside while it is closed. */
function Section({ title, hint, open, onToggle, children, testId }: { title: string; hint?: string; open: boolean; onToggle: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <section className="border-t" data-testid={testId} data-open={open}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-4 py-2.5 text-left text-xs font-semibold transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring">
        <ChevronRight className={cn('size-3.5 text-muted-foreground transition-transform', open && 'rotate-90')} />
        {title}
        {!open && hint && <span className="ml-auto truncate pl-3 font-normal text-muted-foreground">{hint}</span>}
      </button>
      {open && <div className="space-y-2 px-4 pb-4">{children}</div>}
    </section>
  )
}

/** One check on a callout: passed, failed, or just a fact. */
function CheckLine({ tone, title, detail }: { tone: 'ok' | 'warn' | 'bad' | 'plain'; title: string; detail?: string }) {
  return (
    <li className="flex items-start gap-2 border-t border-dashed py-1.5 first:border-t-0 [&>svg]:mt-0.5 [&>svg]:size-3.5 [&>svg]:shrink-0" data-tone={tone}>
      {tone === 'ok' ? <Check className="text-status-pass" /> : tone === 'bad' ? <X className="text-status-fail" /> : tone === 'warn' ? <CircleAlert className="text-status-draft" /> : <Info className="text-muted-foreground" />}
      <span className="min-w-0">
        <span className={cn('block text-xs', tone === 'bad' && 'font-semibold')}>{title}</span>
        {detail && <span className="block text-[11px] leading-snug text-muted-foreground">{detail}</span>}
      </span>
    </li>
  )
}

/** The callout exactly as it is printed, cut from the sheet, so the reading can be checked without hunting for it. */
function Printed({ c }: { c: Characteristic }) {
  const revisionId = useSessionStore((s) => s.revisionId)
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [c.id])
  if (!revisionId || !c.bbox || failed) return null
  const pad = Math.max(16, 1.4 * Math.min(c.bbox.w, c.bbox.h))
  const side = Math.max(0, (3.2 * (c.bbox.h + 2 * pad) - (c.bbox.w + 2 * pad)) / 2)  // keep the picture about three times as wide as tall
  const box = { x: Math.max(0, c.bbox.x - pad - side), y: Math.max(0, c.bbox.y - pad), w: c.bbox.w + 2 * (pad + side), h: c.bbox.h + 2 * pad }
  const round = (v: number) => Math.round(v * 10) / 10
  return (
    <figure className="overflow-hidden rounded-lg border bg-white" data-testid="printed">
      <img src={api.assistCropUrl(revisionId, c.page, { x: round(box.x), y: round(box.y), w: round(box.w), h: round(box.h) })} alt="The callout as printed on the sheet"
        className="h-[84px] w-full object-contain" onError={() => setFailed(true)} />
      <figcaption className="border-t bg-muted/40 px-2 py-0.5 text-right text-[10px] text-muted-foreground">as printed{c.view ? ` · ${c.view}` : ''}{c.zone ? ` · zone ${c.zone}` : ''}</figcaption>
    </figure>
  )
}

/** Where the value sits between its limits. */
function LimitBand({ min, max, value, places }: { min: number; max: number; value: number | null; places: number }) {
  const span = max - min || 1
  const lo = min - span * 0.25
  const hi = max + span * 0.25
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100))}%`
  const inside = value !== null && value >= min - 1e-9 && value <= max + 1e-9
  return (
    <div className="relative mt-3 h-8 select-none" aria-hidden>
      <div className="absolute inset-x-0 top-2 h-1 rounded-full bg-muted" />
      <div className="absolute top-2 h-1 rounded-full bg-status-pass/60" style={{ left: pos(min), right: `calc(100% - ${pos(max)})` }} />
      {value !== null && <div className={cn('absolute top-0 h-5 w-[3px] -translate-x-1/2 rounded', inside ? 'bg-status-pass' : 'bg-status-fail')} style={{ left: pos(value) }} />}
      <span className="absolute top-4 -translate-x-1/2 text-[10px] tabular-nums text-muted-foreground" style={{ left: pos(min) }}>{fmt(min, places)}</span>
      <span className="absolute top-4 -translate-x-1/2 text-[10px] tabular-nums text-muted-foreground" style={{ left: pos(max) }}>{fmt(max, places)}</span>
    </div>
  )
}

/** Right panel: the callout as printed, what it requires, the checks on it, then the result. Editing is folded away. */
export function Inspector() {
  const selected = useCharacteristicStore((s) => s.items.find((c) => c.id === s.selectedId) ?? null)
  const items = useCharacteristicStore((s) => s.items)
  const remove = useCharacteristicStore((s) => s.remove)
  const setLeader = useCharacteristicStore((s) => s.setLeader)
  const update = useCharacteristicStore((s) => s.update)
  const defaults = useSettingsStore((s) => s.defaults)
  const globalStyle = useSettingsStore((s) => s.balloonStyle)
  const show = useUiStore((s) => s.show)
  const [open, setOpen] = useState<{ result: boolean | null; requirement: boolean; details: boolean }>({ result: null, requirement: false, details: false })
  const [showStyle, setShowStyle] = useState(false)
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const onDown = (e: PointerEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false)
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [menu])

  if (!selected) {
    return (
      <aside className="flex h-full flex-col bg-background" data-testid="inspector">
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-xs text-muted-foreground">
          <MousePointerClick className="size-5" />
          <p>Select a balloon, a row, or a problem in the queue to see it here.</p>
          <p>Press <kbd className="rounded border border-b-2 px-1 font-sans text-[10px]">J</kbd> for the next one, or <kbd className="rounded border border-b-2 px-1 font-sans text-[10px]">B</kbd> and click a dimension to add one by hand.</p>
        </div>
      </aside>
    )
  }

  const c = selected
  const patch = (p: Partial<Characteristic>) => update(c.id, p)
  const limits = deriveLimits(c, defaults)
  const status = displayStatus(c, limits)
  const numeric = hasNumericTolerance(c)
  const isGdt = c.toleranceType === 'GD&T'
  const isAttribute = c.measurementType === 'Attribute' || c.descriptionType === 'Note' || c.toleranceType === 'Attribute'
  const tolPlaces = Math.max(c.places, 1)
  const ev = evidence(c)
  const resultNumber = typeof c.result === 'number' ? c.result : c.result === null ? null : parseNumber(String(c.result))
  const color = c.style?.color ?? globalStyle.color

  const state = workStateOf(c, defaults)
  const unchecked = state === 'check' || state === 'flagged'
  const list = visibleItems(items, defaults, show)
  const position = list.findIndex((i) => i.id === c.id)
  // The result opens by itself once the balloon is confirmed; the person's own choice wins after that.
  const resultOpen = open.result ?? !unchecked

  const onDescription = (d: DescriptionType) => {
    const p: Partial<Characteristic> = { descriptionType: d }
    if (GEOMETRIC.has(d) && c.toleranceType !== 'GD&T') {
      p.toleranceType = 'GD&T'
      p.gdt = c.gdt ?? { ...EMPTY_GDT, symbol: symbolFor(d) }
    }
    if (d === 'Note') {
      p.toleranceType = 'Attribute'
      p.measurementType = 'Attribute'
    }
    if (d === 'Angular') p.units = 'deg'
    patch(p)
  }
  const onTolType = (t: ToleranceType) => {
    const p: Partial<Characteristic> = { toleranceType: t }
    if (t === 'GD&T' && !c.gdt) p.gdt = { ...EMPTY_GDT }
    if (t === 'Attribute') p.measurementType = 'Attribute'
    if (t === 'Unilateral' && c.tolHigh === null && c.tolLow === null) p.tolLow = 0
    patch(p)
  }
  const onNominal = (text: string) => {
    const n = parseNumber(text)
    patch({ nominal: n, places: text.trim() ? placesOf(text) : c.places, specification: c.specification || (n === null ? '' : text.trim()) })
  }

  return (
    <aside className="flex h-full flex-col bg-background" data-testid="inspector">
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border-2 px-1 text-xs font-bold tabular-nums" style={{ borderColor: color, color }}>
          {(c.style?.prefix ?? globalStyle.prefix) + balloonLabel(c)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">Balloon {balloonLabel(c)}</p>
          <p className="truncate text-[11px] tabular-nums text-muted-foreground" data-testid="position">{position >= 0 ? `${position + 1} of ${list.length} shown` : 'Not in the current filter'}</p>
        </div>
        <WorkBadge state={state} className="ml-auto" />
        <div className="flex items-center">
          <Tooltip><TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => selectRelative(-1)} aria-label="Previous balloon"><ChevronLeft /></Button>
          </TooltipTrigger><TooltipContent>Previous (K)</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => selectRelative(1)} aria-label="Next balloon"><ChevronRight /></Button>
          </TooltipTrigger><TooltipContent>Next (J)</TooltipContent></Tooltip>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-3 px-4 py-3">
          <Printed c={c} />
          <div>
            <div className="min-h-8 text-[26px] font-bold leading-tight tracking-tight tabular-nums" data-testid="requirement">
              {isGdt && c.gdt ? <Fcf gdt={c.gdt} /> : requirementText(c, limits) || <span className="text-base font-normal text-muted-foreground">No requirement yet</span>}
            </div>
            <div className="mt-2 flex flex-wrap gap-1 text-[11px] font-medium [&>span]:rounded-full [&>span]:border [&>span]:px-2 [&>span]:py-px [&>span]:text-muted-foreground">
              <span>{c.descriptionType}</span>
              {c.view && <span>{c.view}</span>}
              {c.zone && <span>Zone {c.zone}</span>}
              {c.count > 1 && <span>{c.count} places</span>}
              {c.designator && <span>{c.designator}</span>}
              <span>Sheet {c.page + 1}</span>
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Checks</h3>
            <ul className="mt-1" data-testid="checks">
              <CheckLine tone={ev.tone} title={ev.text} detail={ev.tone === 'bad' ? 'The value may be overridden in CAD, or it belongs to another line. Accept it as printed, or correct the requirement.' : undefined} />
              {numeric && !isGdt && limits.origin && (
                <CheckLine tone="ok" title={limits.auto ? `Tolerance from ${limits.origin}` : 'Tolerance printed with the value'} />
              )}
              {(c.toleranceType === 'Basic' || c.toleranceType === 'Reference') && <CheckLine tone="plain" title={c.toleranceType === 'Basic' ? 'Basic dimension: boxed, no tolerance of its own' : 'Reference dimension: for information, not measured'} />}
              {c.source === 'auto'
                ? <CheckLine tone={c.confidence >= 0.8 ? 'ok' : 'warn'} title={`Text read from the CAD file, ${Math.round(c.confidence * 100)}% confidence`} />
                : <CheckLine tone="plain" title="Placed by hand" />}
            </ul>
          </div>
        </div>

        <Section title="Result" testId="section-result" open={resultOpen} onToggle={() => setOpen((o) => ({ ...o, result: !resultOpen }))} hint={c.result !== null && c.result !== '' ? String(c.result) : unchecked ? 'after it is accepted' : 'waiting for a value'}>
          {unchecked && <p className="rounded-md border border-dashed px-2.5 py-1.5 text-[11px] text-muted-foreground">Not confirmed yet. Entering a result here also confirms the balloon.</p>}
          {isAttribute ? (
            <ToggleGroup type="single" value={typeof c.result === 'string' ? c.result : ''} onValueChange={(v) => patch({ result: v || null })} className="w-full">
              <ToggleGroupItem value="Pass" className="flex-1 data-[state=on]:bg-status-pass data-[state=on]:text-white">Pass</ToggleGroupItem>
              <ToggleGroupItem value="Fail" className="flex-1 data-[state=on]:bg-status-fail data-[state=on]:text-white">Fail</ToggleGroupItem>
            </ToggleGroup>
          ) : (
            <>
              <CommitInput
                key={c.id}
                inputMode="decimal"
                autoFocus={state === 'measure'}
                value={c.result === null ? '' : String(c.result)}
                placeholder={limits.min !== null ? `${fmt(limits.min, limitPlaces(c.places, limits))} … ${fmt(limits.max, limitPlaces(c.places, limits))} ${c.units}` : 'Measured value'}
                onCommit={(v) => patch({ result: v.trim() === '' ? null : (parseNumber(v) ?? v.trim()) })}
                onEnter={acceptSelectedAndNext}
                aria-label="Measured result"
                className={cn(
                  'h-10 text-base font-semibold tabular-nums',
                  state === 'measure' && 'border-primary ring-2 ring-primary/15',
                  status === 'Pass' && 'border-status-pass text-status-pass',
                  status === 'Fail' && 'border-status-fail text-status-fail',
                )}
              />
              {limits.min !== null && limits.max !== null && !isGdt && <LimitBand min={limits.min} max={limits.max} value={resultNumber} places={limitPlaces(c.places, limits)} />}
              <p className="text-[11px] text-muted-foreground">Enter saves it and moves to the next one.</p>
            </>
          )}
        </Section>

        <Section title="Requirement" testId="section-requirement" open={open.requirement} onToggle={() => setOpen((o) => ({ ...o, requirement: !o.requirement }))} hint="edit type, nominal, tolerance">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Type">
              <NativeSelect value={c.descriptionType} onChange={(e) => onDescription(e.target.value as DescriptionType)}>
                {DESCRIPTIONS.map((d) => <option key={d}>{d}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Tolerance">
              <NativeSelect value={c.toleranceType} onChange={(e) => onTolType(e.target.value as ToleranceType)}>
                {TOL_TYPES.map((t) => <option key={t}>{t}</option>)}
              </NativeSelect>
            </Field>
          </div>
          {isGdt && c.gdt && <FcfBuilder value={c.gdt} onChange={(g) => patch({ gdt: g })} />}
          {!isGdt && !isAttribute && (
            <div className="grid grid-cols-3 gap-2">
              <Field label="Nominal">
                <CommitInput inputMode="decimal" value={numText(c.nominal, c.places)} placeholder="134.95" onCommit={onNominal} />
              </Field>
              <Field label={c.toleranceType === 'Limits' ? 'Upper limit' : 'High'}>
                <CommitInput
                  inputMode="decimal"
                  value={c.tolHigh === null ? (limits.auto ? numText(limits.high, tolPlaces) : '') : numText(c.tolHigh, tolPlaces)}
                  placeholder={numeric ? '+0.10' : '—'}
                  disabled={!numeric}
                  badge={numeric && c.tolHigh === null ? 'auto' : undefined}
                  onCommit={(v) => patch({ tolHigh: parseNumber(v) })}
                />
              </Field>
              <Field label={c.toleranceType === 'Limits' ? 'Lower limit' : 'Low'}>
                <CommitInput
                  inputMode="decimal"
                  value={c.tolLow === null ? (limits.auto ? numText(limits.low, tolPlaces) : '') : numText(c.tolLow, tolPlaces)}
                  placeholder={numeric ? '-0.10' : '—'}
                  disabled={!numeric}
                  badge={numeric && c.tolLow === null ? 'auto' : undefined}
                  onCommit={(v) => patch({ tolLow: parseNumber(v) })}
                />
              </Field>
            </div>
          )}
          <Field label="As printed">
            <CommitInput value={c.specification} placeholder="3X Ø3 +0.1/0" onCommit={(v) => patch({ specification: v })} />
          </Field>
        </Section>

        <Section title="Details" testId="section-details" open={open.details} onToggle={() => setOpen((o) => ({ ...o, details: !o.details }))} hint="units, quantity, zone, comments, style">
              <div className="grid grid-cols-3 gap-2">
                <Field label="Units">
                  <NativeSelect value={c.units} onChange={(e) => patch({ units: e.target.value as Units })}>
                    <option value="mm">mm</option>
                    <option value="in">in</option>
                    <option value="deg">deg</option>
                  </NativeSelect>
                </Field>
                <Field label="Places">
                  <CommitInput inputMode="numeric" value={String(c.places)} onCommit={(v) => patch({ places: Math.max(0, Math.min(6, Math.round(parseNumber(v) ?? c.places))) })} />
                </Field>
                <Field label="Quantity">
                  <CommitInput inputMode="numeric" value={String(c.count)} onCommit={(v) => patch({ count: Math.max(1, Math.round(parseNumber(v) ?? 1)) })} />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Zone">
                  <CommitInput value={c.zone} placeholder="C4" onCommit={(v) => patch({ zone: v.toUpperCase() })} />
                </Field>
                <Field label="Measured as">
                  <NativeSelect value={c.measurementType} onChange={(e) => patch({ measurementType: e.target.value as MeasurementType })}>
                    <option>Variable</option>
                    <option>Attribute</option>
                  </NativeSelect>
                </Field>
                <Field label="Designator">
                  <NativeSelect value={c.designator} onChange={(e) => patch({ designator: e.target.value as Designator })}>
                    <option value="">none</option>
                    <option>Key</option>
                    <option>Critical</option>
                    <option>Major</option>
                    <option>Minor</option>
                  </NativeSelect>
                </Field>
              </div>
              <Field label="Comments">
                <CommitTextarea value={c.comments} onCommit={(v) => patch({ comments: v })} placeholder="Notes for the report" />
              </Field>
              <label className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-xs">
                <span className="flex items-center gap-1.5"><Spline className="size-3.5 text-muted-foreground" /> Leader line</span>
                <Switch checked={c.leader} onCheckedChange={(v) => setLeader(c.id, v)} aria-label="Leader line on this balloon" />
              </label>
              <div className="rounded-md border px-2.5 py-2 text-xs">
                <button type="button" className="flex w-full items-center justify-between" onClick={() => setShowStyle((v) => !v)} aria-expanded={showStyle}>
                  <span className="flex items-center gap-1.5"><Palette className="size-3.5 text-muted-foreground" /> Balloon style</span>
                  <span className="text-muted-foreground">{c.style ? 'custom' : 'same as the others'}</span>
                </button>
                {showStyle && (
                  <div className="mt-2 space-y-2 border-t pt-2">
                    <BalloonStyleEditor value={{ ...globalStyle, ...(c.style ?? {}) }} onChange={(p) => patch({ style: { ...(c.style ?? {}), ...p } })} compact />
                    {c.style && (
                      <Button variant="outline" size="sm" className="w-full" onClick={() => patch({ style: null })}>
                        Use the shared style
                      </Button>
                    )}
                  </div>
                )}
              </div>
        </Section>
      </div>

      <footer className="flex items-center gap-2 border-t bg-muted/30 px-3 py-2.5">
        <Tooltip><TooltipTrigger asChild>
          <Button size="sm" className="flex-1 gap-1.5" onClick={acceptSelectedAndNext} data-testid="accept-next">
            {unchecked ? <Check /> : null}
            {state === 'flagged' ? 'Accept as printed' : state === 'check' ? 'Accept' : state === 'measure' ? 'Next to measure' : 'Next'}
            {unchecked ? <kbd className="ml-1 rounded border border-current/40 px-1 font-sans text-[10px] opacity-80">A</kbd> : <ArrowRight />}
          </Button>
        </TooltipTrigger><TooltipContent>{unchecked ? 'Confirm this balloon and go to the next one to check (A)' : 'Go to the next one that needs work (A)'}</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => toggleZoomTo(c.id)} aria-label="Zoom to it on the sheet"><ZoomIn /></Button>
        </TooltipTrigger><TooltipContent>Zoom to it on the sheet, and back (F)</TooltipContent></Tooltip>
        <div className="relative" ref={menuRef}>
          <Tooltip><TooltipTrigger asChild>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMenu((v) => !v)} aria-label="More actions" aria-expanded={menu} data-testid="inspector-more"><MoreHorizontal /></Button>
          </TooltipTrigger><TooltipContent>More actions</TooltipContent></Tooltip>
          {menu && (
            <div role="menu" className="absolute bottom-10 right-0 z-40 w-52 rounded-md border bg-background p-1 text-xs shadow-xl">
              {!unchecked && (
                <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent [&_svg]:size-3.5" onClick={() => { patch({ status: 'Draft', result: null }); setMenu(false) }}>
                  <RotateCcw /> Send back to check
                </button>
              )}
              <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-status-fail hover:bg-status-fail/10 [&_svg]:size-3.5" onClick={() => { remove(c.id); setMenu(false) }} data-testid="inspector-delete">
                <Trash2 /> Delete this balloon <span className="ml-auto text-[10px] text-muted-foreground">Del</span>
              </button>
            </div>
          )}
        </div>
      </footer>
    </aside>
  )
}
