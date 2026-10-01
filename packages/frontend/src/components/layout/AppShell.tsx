import { useEffect } from 'react'
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels'
import { ListChecks, Maximize2, PanelRight, Settings2 } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { BrandFooter } from '@/components/brand/Brand'
import { BalloonContextMenu } from '@/components/balloons/BalloonContextMenu'
import { CanvasTools } from '@/components/workspace/CanvasTools'
import { Inspector } from '@/components/workspace/Inspector'
import { SettingsDrawer } from '@/components/workspace/SettingsDrawer'
import { SidePanel } from '@/components/workspace/SidePanel'
import { WorkspaceTopBar } from '@/components/workspace/WorkspaceTopBar'
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
        'relative w-px bg-border transition-colors hover:bg-primary data-[resize-handle-active]:bg-primary',
        'after:absolute after:inset-y-0 after:-left-1 after:-right-1 after:content-[""]',
      )}
    />
  )
}

function HSeparator() {
  return (
    <Separator
      className={cn(
        'relative h-px bg-border transition-colors hover:bg-primary data-[resize-handle-active]:bg-primary',
        'after:absolute after:inset-x-0 after:-top-1 after:-bottom-1 after:content-[""]',
      )}
    />
  )
}

function RailButton({ hint, active, onClick, children, className }: { hint: string; active?: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={hint}
          aria-pressed={active}
          onClick={onClick}
          className={cn(
            'grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&_svg]:size-[18px]',
            active && 'bg-primary/10 text-primary',
            className,
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{hint}</TooltipContent>
    </Tooltip>
  )
}

/** The inspection workspace: steps on top, a rail and today's work on the left, the sheet in the middle, the requirement on the right. */
export function AppShell() {
  useKeyboardShortcuts()
  useAutosave()
  const outerLayout = usePersistedLayout('outer-v2')
  const centerLayout = usePersistedLayout('center-v2')
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
  const step = useUiStore((s) => s.step)

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

  // The grid leads while measuring, the drawing leads while reviewing.
  useEffect(() => {
    const p = bottomRef.current
    if (!p) return
    if (focus) {
      p.collapse()
      return
    }
    if (p.isCollapsed()) p.expand()
    p.resize(step === 'measure' ? '46' : '30')
  }, [step, focus, bottomRef])

  return (
    <TooltipProvider delayDuration={300}>
      <div className="relative flex h-full flex-col bg-muted/40">
        <WorkspaceTopBar />
        <div className="flex min-h-0 flex-1">
          <nav aria-label="Workspace" className="flex w-12 shrink-0 flex-col items-center gap-1 border-r bg-background py-2">
            <RailButton hint={leftCollapsed ? 'Show the work list' : 'Hide the work list'} active={!leftCollapsed && !focus} onClick={toggleLeft}><ListChecks /></RailButton>
            <RailButton hint={rightCollapsed ? 'Show the requirement panel' : 'Hide the requirement panel'} active={!rightCollapsed && !focus} onClick={toggleRight}><PanelRight /></RailButton>
            <RailButton hint={focus ? 'Bring the panels back' : 'Focus on the drawing'} active={focus} onClick={toggleFocus}><Maximize2 /></RailButton>
            <RailButton hint="Inspection settings" active={settingsOpen} onClick={() => setSettingsOpen(true)} className="mt-auto"><Settings2 /></RailButton>
          </nav>
          <Group orientation="horizontal" className="min-h-0 flex-1" {...outer}>
            <Panel className="h-full" id="left" panelRef={leftRef} defaultSize={272} minSize={232} maxSize={400} collapsible collapsedSize={0}
              onResize={(size) => !focus && setLeftCollapsed(size.inPixels === 0)}>
              <SidePanel />
            </Panel>
            <VSeparator />
            <Panel className="h-full" id="center" minSize={360}>
              <Group orientation="vertical" className="h-full" {...center}>
                <Panel className="h-full" id="drawing" defaultSize="70" minSize={160}>
                  <div className="relative h-full w-full">
                    <DrawingSurface />
                    <CanvasTools />
                  </div>
                </Panel>
                <HSeparator />
                <Panel className="h-full" id="bottom" panelRef={bottomRef} defaultSize="30" minSize={110} collapsible collapsedSize={0}>
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
        </div>
        <BrandFooter />
        <BalloonContextMenu />
        <SettingsDrawer />
      </div>
    </TooltipProvider>
  )
}
