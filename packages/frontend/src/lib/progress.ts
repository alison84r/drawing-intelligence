import type { Characteristic } from '@/store/characteristicStore'
import type { DefaultTolerances } from '@/store/settingsStore'
import { deriveLimits, displayStatus } from './tolerance'

/** Basic and reference dimensions are not measured against limits. */
export function isMeasurable(c: Characteristic): boolean {
  return c.toleranceType !== 'Basic' && c.toleranceType !== 'Reference'
}

/**
 * Where one balloon stands in the job. One vocabulary for the queue, the grid, the panel and the sheet:
 *   check    read by the recognizer, nobody has confirmed it yet
 *   flagged  as check, and a check on it failed: it needs a decision, not just a glance
 *   measure  confirmed, waiting for a measured result
 *   done     confirmed, and nothing to measure (basic or reference dimension)
 *   pass / fail  measured
 */
export type WorkState = 'check' | 'flagged' | 'measure' | 'done' | 'pass' | 'fail'

/** What is wrong with a balloon, in one sentence an inspector can act on. Null when nothing is. */
export function issueOf(c: Characteristic): string | null {
  const g = c.geometry
  if (g?.ratioOk === false) {
    return g.kind === 'angular' ? `Its arrowheads span ${g.measured ?? '?'}°` : `Its line measures ${g.measured ?? '?'}`
  }
  return null
}

export function workStateOf(c: Characteristic, defaults: DefaultTolerances): WorkState {
  const status = displayStatus(c, deriveLimits(c, defaults))
  if (status === 'Pass') return 'pass'
  if (status === 'Fail') return 'fail'
  if (status === 'Draft') return issueOf(c) ? 'flagged' : 'check'
  return isMeasurable(c) ? 'measure' : 'done'
}

/** What the workspace is showing. "check" includes the flagged ones: they are still to be checked. */
export type WorkFilter = 'all' | 'check' | 'flagged' | 'measure' | 'pass' | 'fail'

export function matchesFilter(state: WorkState, filter: WorkFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'check') return state === 'check' || state === 'flagged'
  return state === filter
}

export interface Progress {
  total: number
  drafts: number
  accepted: number
  flagged: number
  measurable: number
  measured: number
  toMeasure: number
  passed: number
  fails: number
}

export function progressOf(items: Characteristic[], defaults: DefaultTolerances): Progress {
  const p: Progress = { total: items.length, drafts: 0, accepted: 0, flagged: 0, measurable: 0, measured: 0, toMeasure: 0, passed: 0, fails: 0 }
  for (const c of items) {
    const state = workStateOf(c, defaults)
    if (state === 'check' || state === 'flagged') p.drafts++
    if (state === 'flagged') p.flagged++
    if (state === 'measure') p.toMeasure++
    if (state === 'pass') p.passed++
    if (state === 'fail') p.fails++
    if (isMeasurable(c)) {
      p.measurable++
      if (state === 'pass' || state === 'fail') p.measured++
    }
  }
  p.accepted = p.total - p.drafts
  return p
}

export const byBalloon = (a: Characteristic, b: Characteristic) => a.balloonNumber - b.balloonNumber || (a.subNumber ?? 0) - (b.subNumber ?? 0)

/** The balloons the current filter shows, in balloon order. */
export function visibleItems(items: Characteristic[], defaults: DefaultTolerances, filter: WorkFilter): Characteristic[] {
  return items.filter((c) => matchesFilter(workStateOf(c, defaults), filter)).sort(byBalloon)
}

/**
 * The next balloon that still needs work, after the current one, wrapping round. Work means: to check
 * while anything is unchecked, otherwise to measure. `direction` -1 walks backwards.
 */
export function nextId(items: Characteristic[], defaults: DefaultTolerances, currentId: string | null, direction: 1 | -1 = 1): string | null {
  const sorted = [...items].sort(byBalloon)
  const states = new Map(sorted.map((c) => [c.id, workStateOf(c, defaults)]))
  const current = currentId ? states.get(currentId) : undefined
  const checking = sorted.some((c) => states.get(c.id) === 'check' || states.get(c.id) === 'flagged')
  // Stay in the kind of work the current balloon is in; otherwise take whatever is left.
  const wanted: WorkState[] = current === 'measure' || !checking ? ['measure'] : ['check', 'flagged']
  const at = sorted.findIndex((c) => c.id === currentId)
  for (let k = 1; k <= sorted.length; k++) {
    const c = sorted[(((at + direction * k) % sorted.length) + sorted.length) % sorted.length]
    if (c.id !== currentId && wanted.includes(states.get(c.id) as WorkState)) return c.id
  }
  return null
}
