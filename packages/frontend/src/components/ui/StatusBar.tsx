import { useViewerStore } from '../../store/viewerStore'

export default function StatusBar() {
  const zoomLevel = useViewerStore((s) => s.zoomLevel)
  const selectedEntityId = useViewerStore((s) => s.selectedEntityId)
  const selectedFeatures = useViewerStore((s) => s.selectedFeatures)
  const loadingState = useViewerStore((s) => s.loadingState)

  return (
    <footer className="h-7 flex items-center justify-between px-4 bg-surface-1 border-t border-border shrink-0 z-30">
      <div className="flex items-center gap-4 text-[11px] text-text-muted font-mono">
        {selectedEntityId ? (
          <>
            <span className="text-brand-light">
              {selectedFeatures?.entityRole ?? 'Entity'}
            </span>
            <span className="text-border">|</span>
            <span>{selectedEntityId}</span>
            {selectedFeatures?.totalLength ? (
              <>
                <span className="text-border">|</span>
                <span>L: {selectedFeatures.totalLength.toFixed(2)} px</span>
              </>
            ) : null}
            {selectedFeatures?.bbox ? (
              <>
                <span className="text-border">|</span>
                <span>
                  BBox: {selectedFeatures.bbox.width.toFixed(1)} ×{' '}
                  {selectedFeatures.bbox.height.toFixed(1)}
                </span>
              </>
            ) : null}
          </>
        ) : (
          <span>
            {loadingState === 'loading'
              ? 'Loading drawing…'
              : loadingState === 'ready'
                ? 'Click any entity to inspect'
                : loadingState === 'error'
                  ? 'Error loading drawing'
                  : 'No drawing loaded — upload a PDF or load the sample'}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 text-[11px] text-text-muted font-mono">
        <span>Scroll to zoom · Drag to pan · Click to inspect</span>
        <span className="text-border">|</span>
        <span className="text-text-secondary">{Math.round(zoomLevel * 100)}%</span>
      </div>
    </footer>
  )
}
