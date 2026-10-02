import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Tone = 'bad' | 'warn' | 'ok' | 'plain'

const COUNT_TONE: Record<Tone, string> = {
  bad: 'bg-status-fail/15 text-status-fail',
  warn: 'bg-status-draft/15 text-status-draft',
  ok: 'bg-status-pass/15 text-status-pass',
  plain: 'border text-muted-foreground',
}

/** A group in a side panel: opens and closes, and shows its count even when closed. */
export function Group({ id, icon, title, count, tone, open: controlled, defaultOpen, onToggle, children }: {
  id: string
  icon: React.ReactNode
  title: string
  count: React.ReactNode
  tone: Tone
  /** Controlled when given; otherwise the group keeps its own state, starting at `defaultOpen`. */
  open?: boolean
  defaultOpen?: boolean
  onToggle?: (open: boolean) => void
  children: React.ReactNode
}) {
  const [own, setOwn] = useState(defaultOpen ?? false)
  const open = controlled ?? own
  return (
    <section className="shrink-0 overflow-hidden rounded-lg border bg-background" data-testid={`group-${id}`} data-open={open}>
      <button type="button" onClick={() => { setOwn(!open); onToggle?.(!open) }} aria-expanded={open}
        className="flex w-full items-center gap-2 bg-muted/50 px-2.5 py-1.5 text-left text-xs font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring [&_svg]:size-3.5 [&_svg]:shrink-0">
        <ChevronRight className={cn('text-muted-foreground transition-transform', open && 'rotate-90')} />
        {icon}
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <span className={cn('rounded-full px-2 py-px text-[11px] font-semibold tabular-nums', COUNT_TONE[tone])}>{count}</span>
      </button>
      {open && <div>{children}</div>}
    </section>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="border-t px-2.5 py-2.5 text-[11px] leading-snug text-muted-foreground">{children}</p>
}

/** One fact about the sheet: an icon, what it is, and its value on the right. */
export function Fact({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[auto_auto_1fr] items-start gap-x-2 border-t px-3 py-2 text-xs first:border-t-0 [&>svg]:mt-px [&>svg]:size-3.5 [&>svg]:shrink-0">
      {icon}
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right font-medium">{children}</span>
    </div>
  )
}

export const pill = 'rounded-full border px-2 py-px text-[11px] font-medium transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
