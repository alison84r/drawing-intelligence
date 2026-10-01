import { useEffect, useRef } from 'react'
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels'
import { Check, ChevronLeft, ChevronRight, Flag, ListChecks, Maximize2, PanelRight, Settings2 } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { BrandFooter } from '@/components/brand/Brand'
import { BalloonContextMenu } from '@/components/balloons/BalloonContextMenu'
import { CanvasTools } from '@/components/workspace/CanvasTools'
import { Inspector } from '@/components/workspace/Inspector'
import { SettingsDrawer } from '@/components/workspace/SettingsDrawer'
import { SidePanel } from '@/components/workspace/SidePanel'
import { WorkspaceTopBar } from '@/components/workspace/WorkspaceTopBar'
import { FilterBar } from '@/components/workspace/FilterBar'
import { WorkBadge } from '@/components/status/WorkBadge'
import { balloonLabel, useCharacteristicStore } from '@/store/characteristicStore'
import { useSettingsStore } from '@/store/settingsStore'
import { progressOf, workStateOf } from '@/lib/progress'
import { acceptSelectedAndNext, selectRelative } from '@/lib/workflow'
import { DrawingSurface } from '@/components/drawing/DrawingSurface'
import { usePersistedLayout } from '@/hooks/usePersistedLayout'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useAutosave } from '@/hooks/useAutosave'
import { useUiStore } from '@/store/uiStore'
import { cn } from '@/lib/utils'
import { BottomPane } from './BottomPane'

function VSeparator() {
  return (
    <Separator
      className={cn(
        // One connected surface: panels meet at a single line, a shade stronger than the lines inside them.
        'relative w-px bg-divider transition-colors hover:bg-primary data-[resize-handle-active]:bg-primary',
        'after:absolute after:inset-y-0 after:-left-1 after:-right-1 after:content-[""]',
      )}
    />
  )
}

function HSeparator() {
  return (
    <Separator
      className={cn(
        'relative h-px bg-divider transition-colors hover:bg-primary data-[resize-handle-active]:bg-primary',
        'after:absolute after:inset-x-0 after:-top-1 after:-bottom-1 after:content-[""]',
      )}
    />
  )
}

function RailButton({ hint, active, onClick, children, className, badge, badgeTone }: { hint: string; active?: boolean; onClick: () => void; children: React.ReactNode; className?: string; badge?: number; badgeTone?: 'bad' | 'plain' }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={hint}
          aria-pressed={active}
          onClick={onClick}
          className={cn(
            'relative grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&_svg]:size-[18px]',
            active && 'bg-primary/10 text-primary',
            className,
          )}
        >
          {children}
          {badge !== undefined && badge > 0 && (
            <span className={cn('absolute -right-1 -top-1 min-w-4 rounded-full px-1 text-center text-[9px] font-bold leading-4 tabular-nums', badgeTone === 'bad' ? 'bg-status-fail text-white' : 'bg-primary text-primary-foreground')}>{badge}</span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{hint}</TooltipContent>
    </Tooltip>
  )
}

/** The right panel folded to a strip: which balloon is selected, where it stands, and the two things done most. */
function DetailStrip({ onOpen }: { onOpen: () => void }) {
  const selected = useCharacteristicStore((s) => s.items.find((c) => c.id === s.selectedId) ?? null)
  const defaults = useSettingsStore((s) => s.defaults)
  const state = selected ? workStateOf(selected, defaults) : null
  return (
    <nav aria-label="Selected balloon" className="flex w-12 shrink-0 flex-col items-center gap-1 border-l bg-background py-2" data-testid="detail-strip">
      <RailButton hint="Show the detail panel" onClick={onOpen}><ChevronLeft /></RailButton>
      {selected && state && (
        <>
          <span className="mt-1 grid size-8 place-items-center rounded-full border-2 border-primary text-[11px] font-bold tabular-nums text-primary" title={`Balloon ${balloonLabel(selected)}`}>{balloonLabel(selected)}</span>
          <WorkBadge state={state} className="[&]:px-1 [&]:text-[0px] [&_svg]:size-3.5" />
          <RailButton hint={state === 'check' || state === 'flagged' ? 'Accept and go to the next (A)' : 'Next that needs work (A)'} onClick={acceptSelectedAndNext}><Check /></RailButton>
        </>
      )}
      <RailButton hint="Next balloon (J)" onClick={() => selectRelative(1)}><ChevronRight /></RailButton>
    </nav>
  )
}

/** The inspection workspace: progress on top, the work queue on the left, the sheet in the middle, the selected balloon on the right. */
export function AppShell() {
  useKeyboardShortcuts()
  useAutosave()
  const outerLayout = usePersistedLayout('outer-v2')
  const centerLayout = usePersistedLayout('center-v3')
  // Panels resizing changes the drawing surface size without a window resize; tell it to re-measure.
  const notifyResize = () => {
    window.dispatchEvent(new Event('resize'))
  }
  const outer = { ...outerLayout, onLayoutChange: notifyResize }
  const center = { ...centerLayout, onLayoutChange: notifyResize }

  const leftCollapsed = useUiStore((s) => s.leftCollapsed)
  const rightCollapsed = useUiStore((s) => s.rightCollapsed)
  const setLeftCollapsed = useUiStore((s) => s.setLeftCollapsed)
  const setRightCollapsed = useUiStore((s) => s.setRightCollapsed)
  const toggleLeft = useUiStore((s) => s.toggleLeft)
  const toggleRight = useUiStore((s) => s.toggleRight)
  const focus = useUiStore((s) => s.focus)
  const toggleFocus = useUiStore((s) => s.toggleFocus)
  const settingsOpen = useUiStore((s) => s.settingsOpen)
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen)
  const setShow = useUiStore((s) => s.setShow)
  const items = useCharacteristicStore((s) => s.items)
  const defaults = useSettingsStore((s) => s.defaults)
  const progress = progressOf(items, defaults)

  const leftRef = usePanelRef()
  const rightRef = usePanelRef()
  const bottomRef = usePanelRef()

  // Rail buttons and focus mode drive the panels; dragging a panel shut updates the store.
  useEffect(() => {
    const p = leftRef.current
    if (!p) return
    const want = leftCollapsed || focus
    if (want && !p.isCollapsed()) p.collapse()
    if (!want && p.isCollapsed()) p.expand()
  }, [leftCollapsed, focus, leftRef])

  useEffect(() => {
    const p = rightRef.current
    if (!p) return
    const want = rightCollapsed || focus
    if (want && !p.isCollapsed()) p.collapse()
    if (!want && p.isCollapsed()) p.expand()
  }, [rightCollapsed, focus, rightRef])

  // "Full height" lifts the table over most of the drawing; the same button brings the drawing back.
  const gridTall = useUiStore((s) => s.gridTall)
  const tallBefore = useRef(gridTall)
  useEffect(() => {
    const p = bottomRef.current
    if (tallBefore.current === gridTall) return  // only on a toggle: the height the user dragged to is kept
    tallBefore.current = gridTall
    if (!p || p.isCollapsed()) return
    p.resize(gridTall ? '82%' : '38%')
  }, [gridTall, bottomRef])

  // Focus mode folds the grid away too.
  useEffect(() => {
    const p = bottomRef.current
    if (!p) return
    if (focus) p.collapse()
    else if (p.isCollapsed()) p.expand()
  }, [focus, bottomRef])

  return (
    <TooltipProvider delayDuration={300}>
      <div className="relative flex h-full flex-col bg-muted/40">
        <WorkspaceTopBar />
        <FilterBar />
        <div className="flex min-h-0 flex-1">
          <nav aria-label="Workspace" className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-divider bg-sidebar py-2">
            <RailButton hint={leftCollapsed ? 'Show the work queue' : 'Hide the work queue'} active={!leftCollapsed && !focus} onClick={toggleLeft} badge={leftCollapsed || focus ? progress.drafts : undefined}><ListChecks /></RailButton>
            {(leftCollapsed || focus) && progress.flagged + progress.fails > 0 && (
              <RailButton hint={`${progress.flagged + progress.fails} need a decision. Click to list them`} onClick={() => { setShow(progress.flagged > 0 ? 'flagged' : 'fail'); setLeftCollapsed(false); if (focus) toggleFocus() }} badge={progress.flagged + progress.fails} badgeTone="bad"><Flag /></RailButton>
            )}
            <RailButton hint={rightCollapsed ? 'Show the detail panel' : 'Hide the detail panel'} active={!rightCollapsed && !focus} onClick={toggleRight}><PanelRight /></RailButton>
            <RailButton hint={focus ? 'Bring the panels back' : 'Focus on the drawing'} active={focus} onClick={toggleFocus}><Maximize2 /></RailButton>
            <RailButton hint="Inspection settings" active={settingsOpen} onClick={() => setSettingsOpen(true)} className="mt-auto"><Settings2 /></RailButton>
          </nav>
          {/* One connected surface. The panels differ by tone, not by gaps: sidebar tone on the left,
              the desk under the drawing, white for the table and the detail panel. */}
          <Group orientation="horizontal" className="min-h-0 min-w-0 flex-1" {...outer}>
            <Panel className="h-full" id="left" panelRef={leftRef} defaultSize={272} minSize={232} maxSize={400} collapsible collapsedSize={0}
              onResize={(size) => !focus && setLeftCollapsed(size.inPixels === 0)}>
              <SidePanel />
            </Panel>
            <VSeparator />
            <Panel className="h-full" id="center" minSize={360}>
              <Group orientation="vertical" className="h-full" {...center}>
                <Panel className="h-full" id="drawing" defaultSize="62" minSize={140}>
                  <div className="relative h-full w-full">
                    <DrawingSurface />
                    <CanvasTools />
                  </div>
                </Panel>
                <HSeparator />
                <Panel className="h-full" id="bottom" panelRef={bottomRef} defaultSize="38" minSize={190} collapsible collapsedSize={0}>
                  <BottomPane />
                </Panel>
              </Group>
            </Panel>
            <VSeparator />
            <Panel className="h-full" id="right" panelRef={rightRef} defaultSize={312} minSize={272} maxSize={460} collapsible collapsedSize={0}
              onResize={(size) => !focus && setRightCollapsed(size.inPixels === 0)}>
              <Inspector />
            </Panel>
          </Group>
          {(rightCollapsed || focus) && <DetailStrip onOpen={() => { setRightCollapsed(false); if (focus) toggleFocus() }} />}
        </div>
        <BrandFooter />
        <BalloonContextMenu />
        <SettingsDrawer />
      </div>
    </TooltipProvider>
  )
}
