import { Upload, Type, X, FileText } from 'lucide-react'
import { useViewerStore } from '../../store/viewerStore'
import clsx from 'clsx'

export default function Toolbar() {
  const svgFilename = useViewerStore((s) => s.svgFilename)
  const textHighlightActive = useViewerStore((s) => s.textHighlightActive)
  const toggleTextHighlight = useViewerStore((s) => s.toggleTextHighlight)
  const toggleUploadPanel = useViewerStore((s) => s.toggleUploadPanel)
  const inspectorOpen = useViewerStore((s) => s.inspectorOpen)
  const clearSelection = useViewerStore((s) => s.clearSelection)

  return (
    <header className="h-12 flex items-center justify-between px-4 bg-surface-1 border-b border-border shrink-0 z-30">
      {/* Left: brand + file */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-brand rounded flex items-center justify-center">
            <span className="text-white text-xs font-bold">DI</span>
          </div>
          <span className="text-sm font-semibold text-text-primary tracking-tight">
            Drawing Intelligence
          </span>
        </div>

        {svgFilename && (
          <>
            <span className="text-border text-lg leading-none">|</span>
            <div className="flex items-center gap-1.5 text-text-secondary">
              <FileText size={13} />
              <span className="text-xs font-mono">{svgFilename}</span>
            </div>
          </>
        )}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={toggleTextHighlight}
          title="Highlight all text labels (T)"
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors',
            textHighlightActive
              ? 'bg-yellow-400/20 text-yellow-300 border border-yellow-400/40'
              : 'bg-surface-3 text-text-secondary hover:text-text-primary border border-border hover:border-text-muted'
          )}
        >
          <Type size={13} />
          Text Labels
        </button>

        {inspectorOpen && (
          <button
            onClick={clearSelection}
            title="Close inspector (Esc)"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-surface-3 text-text-secondary hover:text-text-primary border border-border hover:border-text-muted transition-colors"
          >
            <X size={13} />
            Deselect
          </button>
        )}

        <button
          onClick={toggleUploadPanel}
          title="Upload PDF drawing"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-brand hover:bg-brand-hover text-white transition-colors"
        >
          <Upload size={13} />
          Upload PDF
        </button>
      </div>
    </header>
  )
}
