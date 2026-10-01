import type { Gdt } from '@/store/characteristicStore'
import { GDT_MODIFIERS } from '@/lib/tolerance'
import { cn } from '@/lib/utils'

/**
 * A feature control frame drawn the way it appears on the drawing: one thin outline, one hairline
 * between cells, a square cell for the symbol, figures in the app's own typeface.
 * `sm` is sized to sit inside a table row without touching its edges.
 */
export function Fcf({ gdt, className, size = 'md' }: { gdt: Gdt; className?: string; size?: 'sm' | 'md' }) {
  const cells = [
    gdt.symbol,
    `${gdt.zone}${gdt.tolerance || '—'}`,
    ...gdt.datums.map((d) => d.trim().toUpperCase()).filter(Boolean),
  ]
  const mod = gdt.modifier ? GDT_MODIFIERS[gdt.modifier] : ''
  const sm = size === 'sm'
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-stretch overflow-hidden rounded-[3px] border border-foreground/70 bg-background font-medium leading-none tabular-nums text-foreground',
        sm ? 'h-[18px] text-[11px]' : 'h-7 text-sm',
        className,
      )}
      title={cells.join(' ')}
    >
      {cells.map((c, i) => (
        <span
          key={i}
          className={cn(
            'flex items-center justify-center gap-0.5 border-r border-foreground/40 last:border-r-0',
            i === 0
              ? cn('fcf-symbol', sm ? 'w-[18px] text-[12px]' : 'w-7 text-base')
              : sm ? 'px-1.5' : 'px-2',
          )}
        >
          {c}
          {i === 1 && mod && <span className="text-[0.9em]">{mod}</span>}
        </span>
      ))}
    </span>
  )
}
