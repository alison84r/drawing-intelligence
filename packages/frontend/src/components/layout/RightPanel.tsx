import { useEffect, useState } from 'react'
import { Check, MousePointerClick, Palette, Sparkles, Spline, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { FcfBuilder } from '@/components/gdt/FcfBuilder'
import { BalloonStyleEditor } from '@/components/balloons/BalloonStyleEditor'
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
import { deriveLimits, displayStatus, fmt, hasNumericTolerance, parseNumber, placesOf, requirementText } from '@/lib/tolerance'
import { cn } from '@/lib/utils'

const DESCRIPTIONS: DescriptionType[] = [
  'Linear', 'Diameter', 'Radius', 'Angular', 'Chamfer', 'Thread', 'Surface Finish',
  'Flatness', 'Position', 'Perpendicularity', 'Parallelism', 'Profile', 'Runout', 'Concentricity', 'Note', 'Other',
]
const TOL_TYPES: ToleranceType[] = ['Bilateral', 'Unilateral', 'Limits', 'Basic', 'Reference', 'GD&T', 'Attribute']
const GEOMETRIC = new Set<DescriptionType>(['Flatness', 'Position', 'Perpendicularity', 'Parallelism', 'Profile', 'Runout', 'Concentricity'])

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('min-w-0', className)}>
      <Label className="mb-1 block">{label}</Label>
      {children}
    </div>
  )
}

/** Text input that commits on blur or Enter, so each field edit is one undo step. */
function CommitInput({
  value,
  onCommit,
  className,
  badge,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string
  onCommit: (v: string) => void
  badge?: 'auto' | 'typed'
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <div className="relative">
      <Input
        {...rest}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== value && onCommit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
          if (e.key === 'Escape') setDraft(value)
          e.stopPropagation()
        }}
        className={cn(badge && 'pr-11', className)}
      />
      {badge && (
        <span
          className={cn(
            'pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-1 text-[9px] font-semibold uppercase tracking-wide',
            badge === 'auto' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          {badge}
        </span>
      )}
    </div>
  )
}

const numText = (n: number | null, places: number) => (n === null ? '' : fmt(n, places))

export function RightPanel() {
  const selected = useCharacteristicStore((s) => s.items.find((c) => c.id === s.selectedId) ?? null)
  const select = useCharacteristicStore((s) => s.select)
  const remove = useCharacteristicStore((s) => s.remove)
  const setLeader = useCharacteristicStore((s) => s.setLeader)
  const update = useCharacteristicStore((s) => s.update)
  const defaults = useSettingsStore((s) => s.defaults)
  const globalStyle = useSettingsStore((s) => s.balloonStyle)
  const [showStyle, setShowStyle] = useState(false)

  if (!selected) {
    return (
      <aside className="flex h-full flex-col bg-muted/30">
        <div className="border-b px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Edit characteristic</h2>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <MousePointerClick className="size-3.5" /> Select a balloon or a row to edit it.
          </p>
        </div>
        <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">
          Press B and click a dimension on the drawing to add the first characteristic.
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
    <aside className="flex h-full flex-col bg-muted/30">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Edit characteristic</h2>
          <p className="mt-1 flex items-center gap-2 text-sm">
            <span
              className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border-2 px-1 text-xs font-semibold"
              style={{ borderColor: (c.style?.color ?? globalStyle.color), color: (c.style?.color ?? globalStyle.color) }}
            >
              {(c.style?.prefix ?? globalStyle.prefix) + balloonLabel(c)}
            </span>
            <span className="text-muted-foreground">Sheet {c.page + 1}{c.zone ? ` · ${c.zone}` : ''}</span>
          </p>
        </div>
        <StatusBadge status={status} />
      </div>
      {c.source === 'auto' && (
        <div className="flex items-center gap-2 border-b bg-primary/5 px-4 py-2 text-[11px]" data-testid="auto-banner">
          <Sparkles className="size-3.5 shrink-0 text-primary" />
          <span className="text-muted-foreground">
            Recognized · confidence <span className="font-medium text-foreground">{Math.round(c.confidence * 100)}%</span>
          </span>
          {c.status === 'Draft' && (
            <Button size="sm" variant="outline" className="ml-auto h-6 gap-1 px-2 text-[11px]" onClick={() => patch({ status: 'Accepted' })}>
              <Check className="size-3" /> Accept
            </Button>
          )}
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Description">
            <NativeSelect value={c.descriptionType} onChange={(e) => onDescription(e.target.value as DescriptionType)}>
              {DESCRIPTIONS.map((d) => <option key={d}>{d}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Tolerance type">
            <NativeSelect value={c.toleranceType} onChange={(e) => onTolType(e.target.value as ToleranceType)}>
              {TOL_TYPES.map((t) => <option key={t}>{t}</option>)}
            </NativeSelect>
          </Field>
        </div>

        <Field label="Specification (as printed)">
          <CommitInput value={c.specification} placeholder="134.95 or 3X Ø3 +0.1/0" onCommit={(v) => patch({ specification: v })} />
        </Field>

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
                badge={numeric ? (c.tolHigh === null ? 'auto' : 'typed') : undefined}
                onCommit={(v) => patch({ tolHigh: parseNumber(v) })}
              />
            </Field>
            <Field label={c.toleranceType === 'Limits' ? 'Lower limit' : 'Low'}>
              <CommitInput
                inputMode="decimal"
                value={c.tolLow === null ? (limits.auto ? numText(limits.low, tolPlaces) : '') : numText(c.tolLow, tolPlaces)}
                placeholder={numeric ? '-0.10' : '—'}
                disabled={!numeric}
                badge={numeric ? (c.tolLow === null ? 'auto' : 'typed') : undefined}
                onCommit={(v) => patch({ tolLow: parseNumber(v) })}
              />
            </Field>
          </div>
        )}

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
          <Field label="Count">
            <CommitInput inputMode="numeric" value={String(c.count)} onCommit={(v) => patch({ count: Math.max(1, Math.round(parseNumber(v) ?? 1)) })} />
          </Field>
        </div>

        {numeric && (limits.min !== null || isGdt) && (
          <div className="grid grid-cols-2 gap-2 rounded-md border bg-background/60 px-2.5 py-2 text-xs tabular-nums">
            <div><span className="text-muted-foreground">Min </span>{fmt(limits.min, c.places)}</div>
            <div><span className="text-muted-foreground">Max </span>{fmt(limits.max, c.places)}</div>
            <div className="col-span-2 truncate text-muted-foreground" title={requirementText(c, limits)}>
              Requirement: <span className="text-foreground">{requirementText(c, limits) || '—'}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <Field label="Zone">
            <CommitInput value={c.zone} placeholder="C4" onCommit={(v) => patch({ zone: v.toUpperCase() })} />
          </Field>
          <Field label="Type">
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

        <Field label="Result (measured)">
          {isAttribute ? (
            <ToggleGroup
              type="single"
              value={typeof c.result === 'string' ? c.result : ''}
              onValueChange={(v) => patch({ result: v || null })}
              className="w-full"
            >
              <ToggleGroupItem value="Pass" className="flex-1 data-[state=on]:bg-status-pass">Pass</ToggleGroupItem>
              <ToggleGroupItem value="Fail" className="flex-1 data-[state=on]:bg-status-fail">Fail</ToggleGroupItem>
            </ToggleGroup>
          ) : (
            <CommitInput
              inputMode="decimal"
              value={c.result === null ? '' : String(c.result)}
              placeholder={limits.min !== null ? `${fmt(limits.min, c.places)} … ${fmt(limits.max, c.places)}` : 'measured value'}
              onCommit={(v) => patch({ result: v.trim() === '' ? null : (parseNumber(v) ?? v.trim()) })}
              className={cn(status === 'Pass' && 'border-status-pass text-status-pass', status === 'Fail' && 'border-status-fail text-status-fail')}
            />
          )}
        </Field>

        <Field label="Comments">
          <CommitTextarea value={c.comments} onCommit={(v) => patch({ comments: v })} />
        </Field>

        <label className="flex items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-2 text-xs">
          <span className="flex items-center gap-1.5"><Spline className="size-3.5 text-muted-foreground" /> Leader line</span>
          <Switch checked={c.leader} onCheckedChange={(v) => setLeader(c.id, v)} aria-label="Leader line on this balloon" />
        </label>

        <div className="rounded-md border bg-background px-2.5 py-2 text-xs">
          <button type="button" className="flex w-full items-center justify-between" onClick={() => setShowStyle((v) => !v)} aria-expanded={showStyle}>
            <span className="flex items-center gap-1.5"><Palette className="size-3.5 text-muted-foreground" /> Balloon style</span>
            <span className="text-muted-foreground">{c.style ? 'custom' : 'global'}</span>
          </button>
          {showStyle && (
            <div className="mt-2 space-y-2 border-t pt-2">
              <BalloonStyleEditor value={{ ...globalStyle, ...(c.style ?? {}) }} onChange={(p) => patch({ style: { ...(c.style ?? {}), ...p } })} compact />
              {c.style && (
                <Button variant="outline" size="sm" className="w-full" onClick={() => patch({ style: null })}>
                  Use global style
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t px-4 py-3">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => remove(c.id)}>
          <Trash2 /> Delete
        </Button>
        <Button size="sm" className="gap-1.5" onClick={() => select(null)}>
          <Check /> Done
        </Button>
      </div>
    </aside>
  )
}

function CommitTextarea({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <Textarea
      value={draft}
      placeholder="Notes for the report"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => e.stopPropagation()}
    />
  )
}

export function StatusBadge({ status }: { status: 'Draft' | 'Accepted' | 'Pass' | 'Fail' }) {
  return (
    <span
      className={cn(
        'inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold',
        status === 'Draft' && 'bg-status-draft/15 text-status-draft',
        status === 'Accepted' && 'bg-muted text-muted-foreground',
        status === 'Pass' && 'bg-status-pass/15 text-status-pass',
        status === 'Fail' && 'bg-status-fail/15 text-status-fail',
      )}
    >
      {status}
    </span>
  )
}

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
