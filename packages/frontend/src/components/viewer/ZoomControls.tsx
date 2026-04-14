import { ZoomIn, ZoomOut, Maximize2, RotateCcw } from 'lucide-react'
import { useViewerStore } from '../../store/viewerStore'

type Controls = {
  zoomIn: () => void
  zoomOut: () => void
  fit: () => void
  reset: () => void
}

function getControls(): Controls | null {
  return (
    ((window as unknown as Record<string, unknown>).__svgControls as Controls) ??
    null
  )
}

export default function ZoomControls() {
  const zoomLevel = useViewerStore((s) => s.zoomLevel)

  return (
    <div className="absolute bottom-6 right-6 flex flex-col items-center gap-1 z-20">
      {/* Zoom percentage badge */}
      <div className="bg-surface-2 border border-border rounded-md px-2 py-1 text-xs font-mono text-text-secondary mb-1 min-w-[52px] text-center">
        {Math.round(zoomLevel * 100)}%
      </div>

      <div className="flex flex-col gap-0.5 bg-surface-2 border border-border rounded-lg overflow-hidden shadow-xl">
        <button
          onClick={() => getControls()?.zoomIn()}
          title="Zoom In (+)"
          className="p-2 hover:bg-surface-3 text-text-secondary hover:text-text-primary transition-colors"
        >
          <ZoomIn size={16} />
        </button>
        <div className="h-px bg-border" />
        <button
          onClick={() => getControls()?.zoomOut()}
          title="Zoom Out (-)"
          className="p-2 hover:bg-surface-3 text-text-secondary hover:text-text-primary transition-colors"
        >
          <ZoomOut size={16} />
        </button>
        <div className="h-px bg-border" />
        <button
          onClick={() => getControls()?.fit()}
          title="Fit to Canvas (F)"
          className="p-2 hover:bg-surface-3 text-text-secondary hover:text-text-primary transition-colors"
        >
          <Maximize2 size={16} />
        </button>
        <div className="h-px bg-border" />
        <button
          onClick={() => getControls()?.reset()}
          title="Reset Zoom (R)"
          className="p-2 hover:bg-surface-3 text-text-secondary hover:text-text-primary transition-colors"
        >
          <RotateCcw size={16} />
        </button>
      </div>
    </div>
  )
}
