import type { Characteristic, DescriptionType, Gdt } from '@/store/characteristicStore'
import type { DefaultTolerances } from '@/store/settingsStore'

export const GDT_SYMBOLS: { symbol: string; name: string }[] = [
  { symbol: '⌖', name: 'Position' },
  { symbol: '⏥', name: 'Flatness' },
  { symbol: '⏤', name: 'Straightness' },
  { symbol: '○', name: 'Circularity' },
  { symbol: '⌭', name: 'Cylindricity' },
  { symbol: '⌒', name: 'Profile of a line' },
  { symbol: '⌓', name: 'Profile of a surface' },
  { symbol: '⟂', name: 'Perpendicularity' },
  { symbol: '∥', name: 'Parallelism' },
  { symbol: '∠', name: 'Angularity' },
  { symbol: '◎', name: 'Concentricity' },
  { symbol: '⌯', name: 'Symmetry' },
  { symbol: '↗', name: 'Circular runout' },
  { symbol: '⌰', name: 'Total runout' },
]

export const GDT_MODIFIERS: Record<string, string> = { M: 'Ⓜ', L: 'Ⓛ', P: 'Ⓟ', F: 'Ⓕ' }

export const GEOMETRIC_TYPES: DescriptionType[] = [
  'Flatness', 'Position', 'Perpendicularity', 'Parallelism', 'Profile', 'Runout', 'Concentricity',
]

/** Number of decimal places in a typed number, e.g. "134.95" → 2, "3" → 0. */
export function placesOf(text: string): number {
  const m = /[.,](\d+)\s*$/.exec(text.trim())
  return m ? m[1].length : 0
}

export function parseNumber(text: string): number | null {
  const t = text.trim().replace(',', '.').replace(/^\+/, '')
  if (t === '' || t === '-' || t === '.') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function isAngular(c: Pick<Characteristic, 'descriptionType' | 'units'>): boolean {
  return c.descriptionType === 'Angular' || c.units === 'deg'
}

/** Symmetric default tolerance for a characteristic with no printed tolerance. */
export function defaultTolerance(c: Pick<Characteristic, 'descriptionType' | 'units' | 'places'>, d: DefaultTolerances): number {
  if (isAngular(c)) return d.angular
  const key = (['places0', 'places1', 'places2', 'places3'] as const)[Math.min(c.places, 3)]
  return d[key]
}

export interface Limits {
  min: number | null
  max: number | null
  /** Effective signed deviations actually used, after defaults. */
  high: number | null
  low: number | null
  /** True when the default-by-places tolerance was applied because none was typed. */
  auto: boolean
}

export function hasNumericTolerance(c: Pick<Characteristic, 'toleranceType' | 'descriptionType' | 'measurementType'>): boolean {
  if (c.measurementType === 'Attribute' || c.descriptionType === 'Note') return false
  return !['Basic', 'Reference', 'Attribute'].includes(c.toleranceType)
}

/** Min and max for a characteristic, applying the default tolerance when none is typed. */
export function deriveLimits(c: Characteristic, d: DefaultTolerances): Limits {
  const none: Limits = { min: null, max: null, high: null, low: null, auto: false }
  if (!hasNumericTolerance(c)) return none

  if (c.toleranceType === 'GD&T') {
    const t = c.gdt ? parseNumber(c.gdt.tolerance) : c.tolHigh
    return t === null ? none : { min: 0, max: Math.abs(t), high: Math.abs(t), low: 0, auto: false }
  }
  if (c.nominal === null) return none

  if (c.toleranceType === 'Limits') {
    if (c.tolHigh === null || c.tolLow === null) return none
    return { min: Math.min(c.tolHigh, c.tolLow), max: Math.max(c.tolHigh, c.tolLow), high: c.tolHigh, low: c.tolLow, auto: false }
  }

  let high = c.tolHigh
  let low = c.tolLow
  let auto = false
  if (high === null && low === null) {
    const t = defaultTolerance(c, d)
    high = t
    low = -t
    auto = true
  } else {
    high = high ?? 0
    low = low ?? 0
  }
  return { min: c.nominal + Math.min(low, high), max: c.nominal + Math.max(low, high), high, low, auto }
}

export type DisplayStatus = 'Draft' | 'Accepted' | 'Pass' | 'Fail'

const PASS_WORDS = /^(pass|ok|go|good|accept(ed)?|yes)$/i
const FAIL_WORDS = /^(fail|nok|no-?go|reject(ed)?|no)$/i

/** Status shown on the row and the balloon. Pass/Fail once a result exists, else Accepted when the row has content. */
export function displayStatus(c: Characteristic, limits: Limits): DisplayStatus {
  const r = c.result
  if (r !== null && r !== '') {
    if (typeof r === 'string' && PASS_WORDS.test(r)) return 'Pass'
    if (typeof r === 'string' && FAIL_WORDS.test(r)) return 'Fail'
    const n = typeof r === 'number' ? r : parseNumber(r)
    if (n !== null && limits.min !== null && limits.max !== null) {
      return n >= limits.min - 1e-9 && n <= limits.max + 1e-9 ? 'Pass' : 'Fail'
    }
  }
  if (c.source === 'auto' && c.status === 'Draft') return 'Draft'
  return c.nominal !== null || c.specification !== '' || c.gdt !== null ? 'Accepted' : 'Draft'
}

export function fmt(n: number | null, places: number): string {
  return n === null ? '' : n.toFixed(Math.max(places, 0))
}

/** Plain-text feature control frame, e.g. "⌖ Ø0.2Ⓜ A B C". */
export function gdtText(g: Gdt): string {
  const mod = g.modifier ? GDT_MODIFIERS[g.modifier] ?? '' : ''
  return [g.symbol, `${g.zone}${g.tolerance}${mod}`, ...g.datums.filter(Boolean)].join(' ')
}

/** Form 3 "Requirement" text as printed on the drawing, e.g. "Ø5.000 (+/-.010)" or "3X Ø3 (+0.1/0)". */
export function requirementText(c: Characteristic, limits: Limits): string {
  if (c.toleranceType === 'GD&T' && c.gdt) return gdtText(c.gdt)
  if (c.specification && (c.nominal === null || c.toleranceType === 'Attribute' || c.descriptionType === 'Note')) return c.specification
  if (c.nominal === null) return c.specification
  const p = c.places
  const prefix = c.count > 1 ? `${c.count}X ` : ''
  const sym = c.descriptionType === 'Diameter' ? 'Ø' : c.descriptionType === 'Radius' ? 'R' : ''
  const unit = isAngular(c) ? '°' : ''
  const nominal = `${prefix}${sym}${c.nominal.toFixed(p)}${unit}`
  if (c.toleranceType === 'Basic') return `[${nominal}]`
  if (c.toleranceType === 'Reference') return `(${nominal})`
  if (limits.high === null || limits.low === null) return nominal
  if (c.toleranceType === 'Limits') return `${limits.max?.toFixed(p)} / ${limits.min?.toFixed(p)}`
  const tp = Math.max(p, 1)
  if (Math.abs(limits.high + limits.low) < 1e-9) return `${nominal} (±${Math.abs(limits.high).toFixed(tp)})`
  const sign = (v: number) => (v > 0 ? '+' : v < 0 ? '-' : '') + Math.abs(v).toFixed(tp)
  return `${nominal} (${sign(limits.high)}/${sign(limits.low)})`
}
