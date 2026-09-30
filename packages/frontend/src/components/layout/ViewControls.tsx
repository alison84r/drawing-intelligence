import { ChevronLeft, ChevronRight, Maximize, Minus, Plus, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useDocumentStore } from '@/store/documentStore'
import { useViewportStore } from '@/store/viewportStore'

function Ctl({ hint, onClick, disabled, children }: { hint: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClick} disabled={disabled} aria-label={hint}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  )
}

export function ViewControls() {
  const status = useDocumentStore((s) => s.status)
  const pageIndex = useDocumentStore((s) => s.pageIndex)
  const pageCount = useDocumentStore((s) => s.pageCount)
  const prevPage = useDocumentStore((s) => s.prevPage)
  const nextPage = useDocumentStore((s) => s.nextPage)

  const scale = useViewportStore((s) => s.scale)
  const zoomBy = useViewportStore((s) => s.zoomBy)
  const fit = useViewportStore((s) => s.fit)
  const rotate = useViewportStore((s) => s.rotate)

  const ready = status === 'ready'

  return (
    <div className="flex items-center gap-1 text-xs">
      <div className="flex items-center rounded-md border">
        <Ctl hint="Previous page (PageUp)" onClick={prevPage} disabled={!ready || pageIndex === 0}>
          <ChevronLeft />
        </Ctl>
        <span className="min-w-[72px] px-1 text-center tabular-nums text-muted-foreground" aria-live="polite">
          Page {ready ? pageIndex + 1 : 0} / {pageCount}
        </span>
        <Ctl hint="Next page (PageDown)" onClick={nextPage} disabled={!ready || pageIndex >= pageCount - 1}>
          <ChevronRight />
        </Ctl>
      </div>

      <div className="flex items-center rounded-md border">
        <Ctl hint="Zoom out (−)" onClick={() => zoomBy(1 / 1.25)} disabled={!ready}>
          <Minus />
        </Ctl>
        <span className="min-w-[48px] px-1 text-center tabular-nums text-muted-foreground" data-testid="zoom-percent">
          {Math.round(scale * 100)}%
        </span>
        <Ctl hint="Zoom in (+)" onClick={() => zoomBy(1.25)} disabled={!ready}>
          <Plus />
        </Ctl>
        <Ctl hint="Fit to window (0)" onClick={fit} disabled={!ready}>
          <Maximize />
        </Ctl>
        <Ctl hint="Rotate 90°" onClick={rotate} disabled={!ready}>
          <RotateCw />
        </Ctl>
      </div>
    </div>
  )
}
