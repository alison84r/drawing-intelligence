import { useState } from 'react'
import { ArrowRight, Check, ChevronDown, ChevronRight, MousePointerClick, Palette, Sparkles, Spline, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { FcfBuilder } from '@/components/gdt/FcfBuilder'
import { Fcf } from '@/components/gdt/Fcf'
import { BalloonStyleEditor } from '@/components/balloons/BalloonStyleEditor'
import { StatusBadge } from '@/components/status/StatusBadge'
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
import { deriveLimits, displayStatus, fmt, hasNumericTolerance, limitPlaces, parseNumber, placesOf, requirementText } from '@/lib/tolerance'
import { nextId } from '@/lib/progress'
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 border-b px-4 py-3">
      <h3 className="text-xs font-semibold text-muted-foreground">{title}</h3>
      {children}
    </section>
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

/** Right panel: the requirement first, the result directly under it, everything else folded into Details. */
export function Inspector() {
  const selected = useCharacteristicStore((s) => s.items.find((c) => c.id === s.selectedId) ?? null)
  const items = useCharacteristicStore((s) => s.items)
  const select = useCharacteristicStore((s) => s.select)
  const remove = useCharacteristicStore((s) => s.remove)
  const setLeader = useCharacteristicStore((s) => s.setLeader)
  const update = useCharacteristicStore((s) => s.update)
  const defaults = useSettingsStore((s) => s.defaults)
  const globalStyle = useSettingsStore((s) => s.balloonStyle)
  const step = useUiStore((s) => s.step)
  const [details, setDetails] = useState(false)
  const [showStyle, setShowStyle] = useState(false)

  if (!selected) {
    return (
      <aside className="flex h-full flex-col bg-background" data-testid="inspector">
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-xs text-muted-foreground">
          <MousePointerClick className="size-5" />
          <p>Select a balloon or a row to see its requirement here.</p>
          <p>Press B and click a dimension to add one by hand.</p>
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

  const goNext = () => {
    const id = nextId(items, defaults, c.id, step)
    select(id)
  }
  const acceptAndNext = () => {
    if (c.status === 'Draft') patch({ status: 'Accepted' })
    // The store update is synchronous; pick the next draft from the fresh list.
    const fresh = useCharacteristicStore.getState().items
    select(nextId(fresh, defaults, c.id, 'review'))
  }

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
      <header className="border-b px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border-2 px-1 text-xs font-semibold" style={{ borderColor: color, color }}>
              {(c.style?.prefix ?? globalStyle.prefix) + balloonLabel(c)}
            </span>
            Sheet {c.page + 1}{c.zone ? ` · Zone ${c.zone}` : ''}{c.view ? ` · ${c.view}` : ''}{c.designator ? ` · ${c.designator}` : ''}
          </span>
          <StatusBadge status={status} />
        </div>
        <div className="mt-2 min-h-8 text-2xl font-semibold leading-tight tracking-tight tabular-nums" data-testid="requirement">
          {isGdt && c.gdt ? <Fcf gdt={c.gdt} /> : requirementText(c, limits) || <span className="text-base font-normal text-muted-foreground">No requirement yet</span>}
        </div>
        {numeric && !isGdt && limits.origin && (
          <p className="mt-1 text-[11px] text-muted-foreground" data-testid="tolerance-origin">
            Tolerance {limits.auto ? 'from' : ''} <span className="font-medium text-foreground">{limits.origin}</span>
          </p>
        )}
        <p
          className={cn(
            'mt-1.5 flex items-start gap-1.5 text-[11px]',
            ev.tone === 'ok' && 'text-status-pass',
            ev.tone === 'warn' && 'text-status-draft',
            ev.tone === 'bad' && 'text-status-fail',
            ev.tone === 'plain' && 'text-muted-foreground',
          )}
          data-testid="evidence"
        >
          {ev.tone === 'ok' ? <Check className="mt-px size-3.5 shrink-0" /> : <Sparkles className="mt-px size-3.5 shrink-0" />}
          <span>
            {ev.text}
            {c.source === 'auto' && <span className="text-muted-foreground"> · read with {Math.round(c.confidence * 100)}% confidence</span>}
          </span>
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Result">
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
                autoFocus={step === 'measure'}
                value={c.result === null ? '' : String(c.result)}
                placeholder={limits.min !== null ? `${fmt(limits.min, limitPlaces(c.places, limits))} … ${fmt(limits.max, limitPlaces(c.places, limits))} ${c.units}` : 'Measured value'}
                onCommit={(v) => patch({ result: v.trim() === '' ? null : (parseNumber(v) ?? v.trim()) })}
                onEnter={step === 'measure' ? goNext : undefined}
                aria-label="Measured result"
                className={cn(
                  'h-10 text-base font-semibold tabular-nums',
                  step === 'measure' && 'border-primary ring-2 ring-primary/15',
                  status === 'Pass' && 'border-status-pass text-status-pass',
                  status === 'Fail' && 'border-status-fail text-status-fail',
                )}
              />
              {limits.min !== null && limits.max !== null && !isGdt && <LimitBand min={limits.min} max={limits.max} value={resultNumber} places={limitPlaces(c.places, limits)} />}
            </>
          )}
        </Section>

        <Section title="Requirement">
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

        <section className="border-b">
          <button type="button" className="flex w-full items-center gap-1.5 px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground hover:text-foreground" onClick={() => setDetails((v) => !v)} aria-expanded={details}>
            {details ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />} Details
            {!details && <span className="font-normal">units, places, quantity, zone, designator, comments</span>}
          </button>
          {details && (
            <div className="space-y-3 px-4 pb-4">
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
            </div>
          )}
        </section>
      </div>

      <footer className="flex items-center gap-2 border-t px-4 py-3">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => remove(c.id)}>
          <Trash2 /> Delete
        </Button>
        {step === 'review' ? (
          <Button size="sm" className="flex-1 gap-1.5" onClick={acceptAndNext} data-testid="accept-next">
            {c.status === 'Draft' ? 'Accept and next' : 'Next to review'} <ArrowRight />
          </Button>
        ) : (
          <Button size="sm" className="flex-1 gap-1.5" onClick={goNext} data-testid="save-next">
            Next to measure <ArrowRight />
          </Button>
        )}
      </footer>
    </aside>
  )
}
