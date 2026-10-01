import { create } from 'zustand'
import type { Point } from '@/lib/geometry'
import { useSettingsStore, type BalloonStyle } from './settingsStore'

export type DescriptionType =
  | 'Linear' | 'Diameter' | 'Radius' | 'Angular' | 'Chamfer' | 'Thread' | 'Surface Finish'
  | 'Flatness' | 'Position' | 'Perpendicularity' | 'Parallelism' | 'Profile' | 'Runout' | 'Concentricity'
  | 'Note' | 'Other'
export type ToleranceType = 'Bilateral' | 'Unilateral' | 'Limits' | 'Basic' | 'Reference' | 'GD&T' | 'Attribute'
export type MeasurementType = 'Variable' | 'Attribute'
export type CharStatus = 'Draft' | 'Accepted' | 'Pass' | 'Fail'
export type Units = 'mm' | 'in' | 'deg'

export interface OrientedBox {
  cx: number
  cy: number
  w: number
  h: number
  angle: number
}

/** The drawing geometry a callout is tied to: its dimension line (two arrowheads) or its leader. */
export interface CalloutGeometry {
  kind: 'dimension' | 'leader' | 'angular' | 'attached' | 'unverified'
  /** Line segments in page points: [x0, y0, x1, y1]. */
  segments: number[][]
  tips: number[][]
  span?: number
  /** True when the measured length agrees with the value at the sheet scale; false when it does not. */
  ratioOk?: boolean | null
  /** Length (or angle) measured on the drawing at sheet scale. */
  measured?: number | null
  oneArrow?: boolean
}

export type GdtZone = '' | 'Ø' | 'SØ'
export type GdtModifier = '' | 'M' | 'L' | 'P' | 'F'

/** One feature control frame: symbol | zone tolerance modifier | datum | datum | datum. */
export interface Gdt {
  symbol: string
  zone: GdtZone
  tolerance: string
  modifier: GdtModifier
  datums: string[]
}

export const EMPTY_GDT: Gdt = { symbol: '⌖', zone: 'Ø', tolerance: '', modifier: '', datums: ['', '', ''] }

export type Designator = '' | 'Key' | 'Critical' | 'Major' | 'Minor'

/** One row of the Bill of Characteristics. Filled by hand in Phase 1, by the extractor in Phase 2. */
export interface Characteristic {
  id: string
  balloonNumber: number
  subNumber: number | null
  page: number
  /** Where the leader ends, in page points. Without a leader this is the balloon centre. */
  anchor: Point
  /** Where the circle sits, in page points. */
  balloonPos: Point
  leader: boolean
  bbox: { x: number; y: number; w: number; h: number } | null
  /** Box along the reading direction for diagonal text (centre, size, angle in degrees counter-clockwise). */
  obox?: OrientedBox | null
  geometry?: CalloutGeometry | null
  /** The view on the sheet this callout belongs to, as named by Recognize ("SECTION A-A", "View 2"). */
  view?: string
  zone: string
  descriptionType: DescriptionType
  specification: string
  nominal: number | null
  tolHigh: number | null
  tolLow: number | null
  toleranceType: ToleranceType
  gdt: Gdt | null
  units: Units
  places: number
  count: number
  measurementType: MeasurementType
  designator: Designator
  result: number | string | null
  status: CharStatus
  source: 'manual' | 'auto'
  confidence: number
  comments: string
  /** Per-balloon appearance override; null means use the global style. */
  style: Partial<BalloonStyle> | null
}

interface History {
  past: Characteristic[][]
  future: Characteristic[][]
}

interface CharacteristicState extends History {
  items: Characteristic[]
  selectedId: string | null
  /** Page-space distance the balloon sits above its anchor when placed with a leader, in points. */
  leaderOffset: number

  addBalloon: (args: { page: number; at: Point; leader: boolean }) => Characteristic
  addSubBalloon: (parentId: string) => Characteristic | null
  moveBalloon: (id: string, balloonPos: Point, anchor?: Point) => void
  setLeader: (id: string, leader: boolean) => void
  update: (id: string, patch: Partial<Characteristic>) => void
  remove: (id: string) => void
  renumber: (pageHeight: number) => void
  select: (id: string | null) => void
  undo: () => void
  redo: () => void
  clear: () => void
  load: (items: Characteristic[]) => void
  /** Adds records from the Recognize pass, numbering them after the existing balloons. One undo step. */
  addMany: (records: Characteristic[]) => Characteristic[]
  /** Draft rows from the pass become Accepted. One undo step. */
  acceptAll: () => void
  /** The given Draft rows become Accepted. One undo step. */
  acceptIds: (ids: string[]) => void
  /** Removes every balloon the pass created. One undo step. */
  removeAuto: () => void
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)

function nextMainNumber(items: Characteristic[]): number {
  const used = new Set(items.filter((c) => c.subNumber === null).map((c) => c.balloonNumber))
  let n = 1
  while (used.has(n)) n++
  return n
}

export function balloonLabel(c: Characteristic): string {
  return c.subNumber === null ? String(c.balloonNumber) : `${c.balloonNumber}.${c.subNumber}`
}

function commitFrom(state: CharacteristicState, next: Characteristic[]): Partial<CharacteristicState> {
  const depth = Math.max(4, useSettingsStore.getState().undoDepth)
  const past = [...state.past, state.items].slice(-depth)
  return { items: next, past, future: [] }
}

export const useCharacteristicStore = create<CharacteristicState>()((set, get) => ({
  items: [],
  selectedId: null,
  past: [],
  future: [],
  leaderOffset: 40,

  addBalloon: ({ page, at, leader }) => {
    const s = get()
    const settings = useSettingsStore.getState()
    const c: Characteristic = {
      id: uid(),
      balloonNumber: nextMainNumber(s.items),
      subNumber: null,
      page,
      anchor: at,
      balloonPos: leader ? { x: at.x, y: at.y - s.leaderOffset } : at,
      leader,
      bbox: null,
      zone: '',
      descriptionType: 'Linear',
      specification: '',
      nominal: null,
      tolHigh: null,
      tolLow: null,
      toleranceType: 'Bilateral',
      gdt: null,
      units: settings.units,
      places: 2,
      count: 1,
      measurementType: 'Variable',
      designator: '',
      result: null,
      status: 'Draft',
      source: 'manual',
      confidence: 1,
      comments: '',
      style: null,
    }
    set({ ...commitFrom(s, [...s.items, c]), selectedId: c.id })
    return c
  },

  addSubBalloon: (parentId) => {
    const s = get()
    const parent = s.items.find((c) => c.id === parentId)
    if (!parent) return null
    const root = parent.subNumber === null ? parent : s.items.find((c) => c.balloonNumber === parent.balloonNumber && c.subNumber === null) ?? parent
    const k = s.items.filter((c) => c.balloonNumber === root.balloonNumber && c.subNumber !== null).length + 1
    const c: Characteristic = {
      ...root,
      id: uid(),
      subNumber: k,
      balloonPos: { x: root.balloonPos.x + 30 * k, y: root.balloonPos.y },
      specification: '',
      nominal: null,
      tolHigh: null,
      tolLow: null,
      result: null,
      status: 'Draft',
      comments: '',
    }
    set({ ...commitFrom(s, [...s.items, c]), selectedId: c.id })
    return c
  },

  moveBalloon: (id, balloonPos, anchor) => {
    const s = get()
    set(commitFrom(s, s.items.map((c) => (c.id === id ? { ...c, balloonPos, anchor: anchor ?? c.anchor } : c))))
  },

  setLeader: (id, leader) => {
    const s = get()
    set(
      commitFrom(
        s,
        s.items.map((c) => {
          if (c.id !== id) return c
          if (leader && !c.leader) return { ...c, leader, balloonPos: { x: c.anchor.x, y: c.anchor.y - s.leaderOffset } }
          if (!leader && c.leader) return { ...c, leader, balloonPos: c.anchor }
          return c
        }),
      ),
    )
  },

  update: (id, patch) => {
    const s = get()
    set(commitFrom(s, s.items.map((c) => (c.id === id ? { ...c, ...patch } : c))))
  },

  remove: (id) => {
    const s = get()
    const target = s.items.find((c) => c.id === id)
    if (!target) return
    const next = s.items.filter((c) => {
      if (c.id === id) return false
      // Deleting a main balloon removes its sub-balloons too.
      if (target.subNumber === null && c.balloonNumber === target.balloonNumber && c.subNumber !== null) return false
      return true
    })
    set({ ...commitFrom(s, next), selectedId: s.selectedId === id ? null : s.selectedId })
  },

  renumber: (pageHeight) => {
    const s = get()
    const band = Math.max(1, pageHeight / 8)
    const mains = s.items
      .filter((c) => c.subNumber === null)
      .sort((a, b) => a.page - b.page || Math.floor(a.anchor.y / band) - Math.floor(b.anchor.y / band) || a.anchor.x - b.anchor.x)
    const map = new Map<number, number>()
    mains.forEach((c, i) => map.set(c.balloonNumber, i + 1))
    set(commitFrom(s, s.items.map((c) => ({ ...c, balloonNumber: map.get(c.balloonNumber) ?? c.balloonNumber }))))
  },

  select: (selectedId) => set({ selectedId }),

  undo: () => {
    const s = get()
    if (s.past.length === 0) return
    const prev = s.past[s.past.length - 1]
    set({ items: prev, past: s.past.slice(0, -1), future: [s.items, ...s.future], selectedId: null })
  },

  redo: () => {
    const s = get()
    if (s.future.length === 0) return
    const [next, ...rest] = s.future
    set({ items: next, past: [...s.past, s.items], future: rest, selectedId: null })
  },

  addMany: (records) => {
    const s = get()
    const next = [...s.items]
    const added: Characteristic[] = []
    for (const r of records) {
      const c: Characteristic = { ...r, id: r.id || uid(), balloonNumber: nextMainNumber(next), subNumber: null }
      next.push(c)
      added.push(c)
    }
    if (added.length) set(commitFrom(s, next))
    return added
  },
  acceptAll: () => {
    const s = get()
    if (!s.items.some((c) => c.source === 'auto' && c.status === 'Draft')) return
    set(commitFrom(s, s.items.map((c) => (c.source === 'auto' && c.status === 'Draft' ? { ...c, status: 'Accepted' } : c))))
  },
  acceptIds: (ids) => {
    const s = get()
    const want = new Set(ids)
    if (!s.items.some((c) => want.has(c.id) && c.status === 'Draft')) return
    set(commitFrom(s, s.items.map((c) => (want.has(c.id) && c.status === 'Draft' ? { ...c, status: 'Accepted' } : c))))
  },
  removeAuto: () => {
    const s = get()
    if (!s.items.some((c) => c.source === 'auto')) return
    const next = s.items.filter((c) => c.source !== 'auto')
    set({ ...commitFrom(s, next), selectedId: next.some((c) => c.id === s.selectedId) ? s.selectedId : null })
  },
  clear: () => set({ items: [], past: [], future: [], selectedId: null }),
  load: (items) => set({ items, past: [], future: [], selectedId: null }),
}))
