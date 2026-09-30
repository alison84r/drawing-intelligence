import { useEffect } from 'react'
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels'
import { TooltipProvider } from '@/components/ui/tooltip'
import { usePersistedLayout } from '@/hooks/usePersistedLayout'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useAutosave } from '@/hooks/useAutosave'
import { useUiStore } from '@/store/uiStore'
import { cn } from '@/lib/utils'
import { BrandFooter } from '@/components/brand/Brand'
import { TopBar } from './TopBar'
import { LeftPanel } from './LeftPanel'
import { RightPanel } from './RightPanel'
import { DrawingPane } from './DrawingPane'
import { BottomPane } from './BottomPane'

function VSeparator({ className }: { className?: string }) {
  return (
    <Separator
      className={cn(
        'relative w-px bg-border transition-colors hover:bg-primary data-[resize-handle-active]:bg-primary',
        'after:absolute after:inset-y-0 after:-left-1 after:-right-1 after:content-[""]',
        className,
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

export function AppShell() {
  useKeyboardShortcuts()
  useAutosave()
  const outerLayout = usePersistedLayout('outer')
  const centerLayout = usePersistedLayout('center')
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

  const leftRef = usePanelRef()
  const rightRef = usePanelRef()

  // Toolbar buttons drive the panels; dragging a panel shut updates the store.
  useEffect(() => {
    const p = leftRef.current
    if (!p) return
    if (leftCollapsed && !p.isCollapsed()) p.collapse()
    if (!leftCollapsed && p.isCollapsed()) p.expand()
  }, [leftCollapsed, leftRef])

  useEffect(() => {
    const p = rightRef.current
    if (!p) return
    if (rightCollapsed && !p.isCollapsed()) p.collapse()
    if (!rightCollapsed && p.isCollapsed()) p.expand()
  }, [rightCollapsed, rightRef])

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full flex-col bg-background">
        <TopBar />
        <Group orientation="horizontal" className="min-h-0 flex-1" {...outer}>
          <Panel className="h-full"
            id="left"
            panelRef={leftRef}
            defaultSize={260}
            minSize={200}
            maxSize={420}
            collapsible
            collapsedSize={0}
            onResize={(size) => setLeftCollapsed(size.inPixels === 0)}
          >
            <LeftPanel />
          </Panel>
          <VSeparator />
          <Panel className="h-full" id="center" minSize={360}>
            <Group orientation="vertical" className="h-full" {...center}>
              <Panel className="h-full" id="drawing" defaultSize="60" minSize={160}>
                <DrawingPane />
              </Panel>
              <HSeparator />
              <Panel className="h-full" id="bottom" defaultSize="40" minSize={120}>
                <BottomPane />
              </Panel>
            </Group>
          </Panel>
          <VSeparator />
          <Panel className="h-full"
            id="right"
            panelRef={rightRef}
            defaultSize={320}
            minSize={260}
            maxSize={480}
            collapsible
            collapsedSize={0}
            onResize={(size) => setRightCollapsed(size.inPixels === 0)}
          >
            <RightPanel />
          </Panel>
        </Group>
        <BrandFooter />
      </div>
    </TooltipProvider>
  )
}
