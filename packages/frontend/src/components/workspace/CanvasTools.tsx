import { ChevronLeft, ChevronRight, Circle, CircleDot, Eye, EyeOff, GitBranch, Hand, Loader2, Maximize, Minus, MousePointer2, Plus, RotateCw, ScanSearch, Spline, SquareDashedMousePointer } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCharacteristicStore } from '@/store/characteristicStore'
import { useDocumentStore } from '@/store/documentStore'
import { useRecognizeStore, type TokenView } from '@/store/recognizeStore'
import { useSessionStore } from '@/store/sessionStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useUiStore, type ToolMode } from '@/store/uiStore'
import { useViewportStore } from '@/store/viewportStore'
import { cn } from '@/lib/utils'

const TOOLS: { value: ToolMode; label: string; hint: string; icon: React.ReactNode }[] = [
  { value: 'select', label: 'Select', hint: 'Select and drag (S)', icon: <MousePointer2 /> },
  { value: 'single', label: 'Balloon', hint: 'Place one balloon (B)', icon: <Circle /> },
  { value: 'multiple', label: 'Many', hint: 'Keep placing balloons (M)', icon: <CircleDot /> },
  { value: 'sub', label: 'Sub', hint: 'Click a balloon to add 5.1, 5.2 (N)', icon: <GitBranch /> },
  { value: 'window', label: 'Window', hint: 'Drag over a region to read it again (W)', icon: <SquareDashedMousePointer /> },
  { value: 'pan', label: 'Pan', hint: 'Pan the drawing (H)', icon: <Hand /> },
]

function Bar({ className, children, label }: { className?: string; children: React.ReactNode; label: string }) {
  return (
    <div role="toolbar" aria-label={label} className={cn('absolute z-10 flex items-center gap-0.5 rounded-xl border bg-background/95 p-1 shadow-lg backdrop-blur', className)}>
      {children}
    </div>
  )
}

function Tool({ hint, active, disabled, onClick, children, wide }: { hint: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={hint}
          aria-pressed={active}
          disabled={disabled}
          onClick={onClick}
          className={cn(
            'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg text-xs font-medium text-muted-foreground transition-colors [&_svg]:size-4',
            wide ? 'px-2.5' : 'w-8',
            'hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40',
            active && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  )
}

const Sep = () => <span className="mx-1 h-5 w-px bg-border" />

const VIEW_NEXT: Record<TokenView, TokenView> = { review: 'all', all: 'off', off: 'review' }
const VIEW_LABEL: Record<TokenView, string> = { review: 'Quiet', all: 'Audit', off: 'Off' }

/** Tools float over the drawing so the sheet keeps the room: tools bottom centre, zoom bottom right, sheet and recognise on top. */
export function CanvasTools() {
  const tool = useUiStore((s) => s.tool)
  const setTool = useUiStore((s) => s.setTool)
  const ready = useDocumentStore((s) => s.status === 'ready')
  const pageIndex = useDocumentStore((s) => s.pageIndex)
  const pageCount = useDocumentStore((s) => s.pageCount)
  const prevPage = useDocumentStore((s) => s.prevPage)
  const nextPage = useDocumentStore((s) => s.nextPage)
  const scale = useViewportStore((s) => s.scale)
  const zoomBy = useViewportStore((s) => s.zoomBy)
  const fit = useViewportStore((s) => s.fit)
  const rotate = useViewportStore((s) => s.rotate)
  const leaderDefault = useSettingsStore((s) => s.leaderDefault)
  const setLeaderDefault = useSettingsStore((s) => s.setLeaderDefault)
  const selected = useCharacteristicStore((s) => s.items.find((c) => c.id === s.selectedId) ?? null)
  const setLeader = useCharacteristicStore((s) => s.setLeader)
  const running = useRecognizeStore((s) => s.status === 'running')
  const run = useRecognizeStore((s) => s.run)
  const hasScene = useRecognizeStore((s) => Boolean(s.pages[pageIndex]))
  const tokenView = useRecognizeStore((s) => s.tokenView)
  const setTokenView = useRecognizeStore((s) => s.setTokenView)
  const unreadable = useRecognizeStore((s) => s.intake?.level === 'bad')
  const revisionId = useSessionStore((s) => s.revisionId)

  if (!ready) return null
  const leaderChecked = selected && tool === 'select' ? selected.leader : leaderDefault
  const onLeader = (v: boolean) => (selected && tool === 'select' ? setLeader(selected.id, v) : setLeaderDefault(v))

  return (
    <>
      <Bar label="Sheet" className="left-3 top-3">
        <Tool hint="Previous sheet (PageUp)" onClick={prevPage} disabled={pageIndex === 0}><ChevronLeft /></Tool>
        <span className="min-w-[78px] px-1 text-center text-xs tabular-nums text-muted-foreground" aria-live="polite">Sheet {pageIndex + 1} / {pageCount}</span>
        <Tool hint="Next sheet (PageDown)" onClick={nextPage} disabled={pageIndex >= pageCount - 1}><ChevronRight /></Tool>
      </Bar>

      <Bar label="Recognition" className="right-3 top-3">
        <Tool hint={hasScene ? 'Read the drawing again' : 'Read the drawing and place balloons'} wide onClick={() => void run()} disabled={!revisionId || running || unreadable}>
          {running ? <Loader2 className="animate-spin" /> : <ScanSearch />} {hasScene ? 'Recognize again' : 'Recognize'}
        </Tool>
        <Sep />
        <Tool hint={`Highlights: ${VIEW_LABEL[tokenView]}. Click to change`} wide onClick={() => setTokenView(VIEW_NEXT[tokenView])}>
          {tokenView === 'off' ? <EyeOff /> : <Eye />} {VIEW_LABEL[tokenView]}
        </Tool>
      </Bar>

      <Bar label="Drawing tools" className="bottom-3 left-1/2 -translate-x-1/2">
        {TOOLS.map((t) => (
          <Tool key={t.value} hint={t.hint} active={tool === t.value} wide onClick={() => setTool(t.value)}>
            {t.icon}
            <span className="hidden 2xl:inline">{t.label}</span>
          </Tool>
        ))}
        <Sep />
        <Tooltip>
          <TooltipTrigger asChild>
            <label className="flex h-8 cursor-pointer items-center gap-2 rounded-lg px-2 text-xs text-muted-foreground hover:bg-accent">
              <Spline className="size-4" />
              <span className="hidden xl:inline">Leader</span>
              <Switch checked={leaderChecked} onCheckedChange={onLeader} aria-label="Leader line" />
            </label>
          </TooltipTrigger>
          <TooltipContent>{selected && tool === 'select' ? 'Leader line on the selected balloon (L)' : 'Leader line on new balloons (L)'}</TooltipContent>
        </Tooltip>
      </Bar>

      <Bar label="Zoom" className="bottom-3 right-3">
        <Tool hint="Zoom out (−)" onClick={() => zoomBy(1 / 1.25)}><Minus /></Tool>
        <span className="min-w-[46px] text-center text-xs tabular-nums text-muted-foreground" data-testid="zoom-percent">{Math.round(scale * 100)}%</span>
        <Tool hint="Zoom in (+)" onClick={() => zoomBy(1.25)}><Plus /></Tool>
        <Sep />
        <Tool hint="Fit the sheet (0)" onClick={fit}><Maximize /></Tool>
        <Tool hint="Rotate 90°" onClick={rotate}><RotateCw /></Tool>
      </Bar>
    </>
  )
}
