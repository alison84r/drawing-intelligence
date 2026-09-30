import { cn } from '@/lib/utils'

export const BRAND = {
  company: 'DataVers.AI',
  tagline: 'Engineering Intelligence',
  product: 'Drawing Intelligence',
  version: '0.1.0',
  year: 2026,
  site: 'https://datavers.ai',
} as const

export const COPYRIGHT = `© ${BRAND.year} ${BRAND.company} · ${BRAND.tagline} · All rights reserved`

/**
 * Company logo. The white-and-cyan artwork only ever sits on navy or on the dark header:
 * in light mode it rides on its navy chip, in dark mode the chip is transparent.
 */
export function BrandLogo({ height = 22, className, chip = true }: { height?: number; className?: string; chip?: boolean }) {
  return (
    <a
      href={BRAND.site}
      target="_blank"
      rel="noreferrer"
      title={`${BRAND.company} · ${BRAND.tagline}`}
      className={cn(
        'inline-flex shrink-0 items-center rounded-md transition-opacity hover:opacity-90',
        chip && 'brand-chip',
        className,
      )}
    >
      <img src="/brand/logo-light-on-dark.png" alt={BRAND.company} style={{ height }} className="block w-auto select-none" draggable={false} />
    </a>
  )
}

/** Hexagon mark alone, for tight spots. */
export function BrandMark({ size = 20, className }: { size?: number; className?: string }) {
  return <img src="/brand/icon-64.png" alt="" width={size} height={size} className={cn('select-none', className)} draggable={false} />
}

/** Copyright strip under the workspace and the library. */
export function BrandFooter({ className }: { className?: string }) {
  return (
    <footer className={cn('flex h-6 shrink-0 items-center gap-3 border-t bg-muted/40 px-3 text-[11px] text-muted-foreground', className)}>
      <BrandLogo height={11} className="brand-chip-sm" />
      <span className="truncate">{COPYRIGHT}</span>
      <span className="ml-auto whitespace-nowrap tabular-nums">
        {BRAND.product} v{BRAND.version}
      </span>
    </footer>
  )
}
