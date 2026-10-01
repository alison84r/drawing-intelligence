import { cn } from '@/lib/utils'
import type { DisplayStatus } from '@/lib/tolerance'

/** The one way a characteristic's state is shown as a chip: grid, inspector and lists all use it. */
export function StatusBadge({ status, className }: { status: DisplayStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2 py-px text-[11px] font-semibold',
        status === 'Draft' && 'border border-dashed border-[#1d4ed8]/60 text-[#1d4ed8] dark:border-[#93c5fd]/60 dark:text-[#93c5fd]',
        status === 'Accepted' && 'bg-status-pass/15 text-status-pass',
        status === 'Pass' && 'bg-status-pass/15 text-status-pass',
        status === 'Fail' && 'bg-status-fail/15 text-status-fail',
        className,
      )}
    >
      {status === 'Accepted' ? '✓ Accepted' : status}
    </span>
  )
}
