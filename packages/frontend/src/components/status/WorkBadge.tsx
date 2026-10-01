import { Check, CircleDashed, Flag, Ruler, X } from 'lucide-react'
import type { WorkState } from '@/lib/progress'
import { cn } from '@/lib/utils'

export const WORK_LABEL: Record<WorkState, string> = {
  check: 'To check',
  flagged: 'Flagged',
  measure: 'To measure',
  done: 'Accepted',
  pass: 'Pass',
  fail: 'Fail',
}

/** One sentence on what the state means and what to do next; used as the tooltip everywhere the pill appears. */
export const WORK_HINT: Record<WorkState, string> = {
  check: 'Read from the drawing. Confirm it, or correct it first.',
  flagged: 'A check on this one failed. Look at it before accepting.',
  measure: 'Confirmed. Waiting for the measured value.',
  done: 'Confirmed. Nothing to measure: a basic or reference dimension.',
  pass: 'Measured, inside its limits.',
  fail: 'Measured, outside its limits.',
}

const LOOK: Record<WorkState, { cls: string; icon: React.ReactNode }> = {
  check: { cls: 'border border-dashed border-[#1d4ed8]/60 text-[#1d4ed8] dark:border-[#93c5fd]/60 dark:text-[#93c5fd]', icon: <CircleDashed /> },
  flagged: { cls: 'bg-status-fail/15 text-status-fail', icon: <Flag /> },
  measure: { cls: 'bg-[#1d4ed8]/10 text-[#1d4ed8] dark:bg-[#93c5fd]/15 dark:text-[#93c5fd]', icon: <Ruler /> },
  done: { cls: 'bg-status-pass/15 text-status-pass', icon: <Check /> },
  pass: { cls: 'bg-status-pass/15 text-status-pass', icon: <Check /> },
  fail: { cls: 'bg-status-fail/15 text-status-fail', icon: <X /> },
}

/** The one pill for where a balloon stands: queue, grid, detail panel all use it. */
export function WorkBadge({ state, className }: { state: WorkState; className?: string }) {
  return (
    <span
      title={WORK_HINT[state]}
      data-work={state}
      className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-px text-[11px] font-semibold [&_svg]:size-3 [&_svg]:shrink-0', LOOK[state].cls, className)}
    >
      {LOOK[state].icon}
      {WORK_LABEL[state]}
    </span>
  )
}
