import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCharacteristicStore } from '@/store/characteristicStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useUiStore } from '@/store/uiStore'
import { progressOf, type WorkFilter } from '@/lib/progress'
import { cn } from '@/lib/utils'

function Key({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-b-2 bg-background px-1 font-sans text-[10px] font-medium text-muted-foreground">{children}</kbd>
}

/** One list of balloons; these chips choose which part of it is on screen. The counts are the job at a glance. */
export function FilterBar() {
  const items = useCharacteristicStore((s) => s.items)
  const defaults = useSettingsStore((s) => s.defaults)
  const show = useUiStore((s) => s.show)
  const setShow = useUiStore((s) => s.setShow)
  const p = progressOf(items, defaults)
  if (items.length === 0) return null

  const chips: { value: WorkFilter; label: string; count: number; dot?: string; hint: string }[] = [
    { value: 'all', label: 'All', count: p.total, hint: 'Every balloon on this inspection' },
    { value: 'check', label: 'To check', count: p.drafts, dot: 'bg-[#1d4ed8]', hint: 'Read from the drawing and not confirmed yet' },
    { value: 'flagged', label: 'Flagged', count: p.flagged, dot: 'bg-status-fail', hint: 'A check failed: these need a decision' },
    { value: 'measure', label: 'To measure', count: p.toMeasure, dot: 'bg-status-draft', hint: 'Confirmed, waiting for a measured value' },
    { value: 'pass', label: 'Passed', count: p.passed, dot: 'bg-status-pass', hint: 'Measured, inside the limits' },
    { value: 'fail', label: 'Failed', count: p.fails, dot: 'bg-status-fail', hint: 'Measured, outside the limits' },
  ]

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-divider bg-sidebar px-3 py-1.5" role="group" aria-label="Which balloons to show" data-testid="filter-bar">
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Show</span>
      {chips.map((c) => (
        <Tooltip key={c.value}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-pressed={show === c.value}
              data-testid={`show-${c.value}`}
              onClick={() => setShow(c.value)}
              className={cn(
                'inline-flex h-6 items-center gap-1.5 rounded-full border bg-background px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                show === c.value && 'border-primary bg-primary text-primary-foreground hover:text-primary-foreground',
                c.count === 0 && show !== c.value && 'opacity-60',
              )}
            >
              {c.dot && <span className={cn('size-2 rounded-full', show === c.value ? 'bg-primary-foreground' : c.dot)} />}
              {c.label}
              <span className={cn('font-semibold tabular-nums', show === c.value ? 'text-primary-foreground' : 'text-foreground')}>{c.count}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>{c.hint}</TooltipContent>
        </Tooltip>
      ))}
      <span className="ml-auto hidden items-center gap-1.5 text-[11px] text-muted-foreground xl:flex">
        Next <Key>J</Key> Previous <Key>K</Key> Accept <Key>A</Key> Zoom to it <Key>F</Key>
      </span>
    </div>
  )
}
