import { X } from 'lucide-react'
import { useViewerStore } from '../../store/viewerStore'
import FeatureTable from './FeatureTable'
import clsx from 'clsx'

export default function EntityInspector() {
  const inspectorOpen = useViewerStore((s) => s.inspectorOpen)
  const selectedFeatures = useViewerStore((s) => s.selectedFeatures)
  const clearSelection = useViewerStore((s) => s.clearSelection)

  return (
    <aside
      className={clsx(
        'inspector-panel absolute top-0 right-0 h-full w-80 bg-surface-1 border-l border-border flex flex-col z-20 shadow-2xl',
        inspectorOpen ? 'open' : 'closed'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Entity Inspector</h2>
          <p className="text-[10px] text-text-muted mt-0.5">Geometric & style properties</p>
        </div>
        <button
          onClick={clearSelection}
          className="p-1 rounded hover:bg-surface-3 text-text-muted hover:text-text-primary transition-colors"
          title="Close (Esc)"
        >
          <X size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {selectedFeatures ? (
          <FeatureTable features={selectedFeatures} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-text-muted text-sm text-center">
              Click any entity on the drawing to inspect its properties
            </p>
          </div>
        )}
      </div>
    </aside>
  )
}
