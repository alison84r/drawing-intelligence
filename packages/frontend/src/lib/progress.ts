import type { Characteristic } from '@/store/characteristicStore'
import type { DefaultTolerances } from '@/store/settingsStore'
import { deriveLimits, displayStatus } from './tolerance'

/** Basic and reference dimensions are not measured against limits. */
export function isMeasurable(c: Characteristic): boolean {
  return c.toleranceType !== 'Basic' && c.toleranceType !== 'Reference'
}

export interface Progress {
  total: number
  drafts: number
  accepted: number
  measurable: number
  measured: number
  fails: number
}

export function progressOf(items: Characteristic[], defaults: DefaultTolerances): Progress {
  let drafts = 0
  let measurable = 0
  let measured = 0
  let fails = 0
  for (const c of items) {
    const status = displayStatus(c, deriveLimits(c, defaults))
    if (status === 'Draft') drafts++
    if (status === 'Fail') fails++
    if (isMeasurable(c)) {
      measurable++
      if (c.result !== null && c.result !== '') measured++
    }
  }
  return { total: items.length, drafts, accepted: items.length - drafts, measurable, measured, fails }
}

const order = (a: Characteristic, b: Characteristic) => a.balloonNumber - b.balloonNumber || (a.subNumber ?? 0) - (b.subNumber ?? 0)

/** The next characteristic that still needs work in this step, after the current one, wrapping round. */
export function nextId(items: Characteristic[], defaults: DefaultTolerances, currentId: string | null, step: 'review' | 'measure'): string | null {
  const sorted = [...items].sort(order)
  const todo = (c: Characteristic) =>
    step === 'review' ? displayStatus(c, deriveLimits(c, defaults)) === 'Draft' : isMeasurable(c) && (c.result === null || c.result === '')
  const at = sorted.findIndex((c) => c.id === currentId)
  for (let k = 1; k <= sorted.length; k++) {
    const c = sorted[(at + k + sorted.length) % sorted.length]
    if (c.id !== currentId && todo(c)) return c.id
  }
  return null
}
