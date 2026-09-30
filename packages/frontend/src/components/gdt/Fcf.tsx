import type { Gdt } from '@/store/characteristicStore'
import { GDT_MODIFIERS } from '@/lib/tolerance'
import { cn } from '@/lib/utils'

/** A feature control frame drawn the way it appears on the drawing. */
export function Fcf({ gdt, className, size = 'md' }: { gdt: Gdt; className?: string; size?: 'sm' | 'md' }) {
  const cells = [
    gdt.symbol,
    `${gdt.zone}${gdt.tolerance || '—'}`,
    ...gdt.datums.map((d) => d.trim().toUpperCase()).filter(Boolean),
  ]
  const mod = gdt.modifier ? GDT_MODIFIERS[gdt.modifier] : ''
  return (
    <span
      className={cn(
        'inline-flex items-stretch border border-foreground bg-background font-mono leading-none text-foreground',
        size === 'sm' ? 'text-[11px]' : 'text-sm',
        className,
      )}
      title={cells.join(' ')}
    >
      {cells.map((c, i) => (
        <span
          key={i}
          className={cn('flex items-center gap-0.5 border-r border-foreground px-1.5 py-0.5 last:border-r-0', size === 'sm' ? 'px-1' : '')}
        >
          {c}
          {i === 1 && mod && <span className="text-[0.9em]">{mod}</span>}
        </span>
      ))}
    </span>
  )
}
