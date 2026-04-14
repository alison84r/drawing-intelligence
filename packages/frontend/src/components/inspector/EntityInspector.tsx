import { X, Tag, Hash, Crosshair, Database } from 'lucide-react'
import { useViewerStore } from '../../store/viewerStore'
import { useExtractionStore, CATEGORY_META, type ExtractedEntity } from '../../store/extractionStore'
import FeatureTable from './FeatureTable'
import clsx from 'clsx'

type Props = { selectedExtracted: ExtractedEntity | null }

export default function EntityInspector({ selectedExtracted }: Props) {
  const inspectorOpen = useViewerStore((s) => s.inspectorOpen)
  const selectedFeatures = useViewerStore((s) => s.selectedFeatures)
  const clearSelection = useViewerStore((s) => s.clearSelection)
  const clearExtracted = useExtractionStore((s) => s.selectExtracted)

  const isOpen = inspectorOpen || selectedExtracted !== null

  const handleClose = () => {
    clearSelection()
    clearExtracted(null)
  }

  return (
    <aside
      className={clsx(
        'inspector-panel absolute top-0 right-0 h-full w-80 bg-surface-1 border-l border-border flex flex-col z-20 shadow-2xl',
        isOpen ? 'open' : 'closed'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Entity Inspector</h2>
          <p className="text-[10px] text-text-muted mt-0.5">
            {selectedExtracted ? 'Extracted entity data' : 'Geometric & style properties'}
          </p>
        </div>
        <button
          onClick={handleClose}
          className="p-1 rounded hover:bg-surface-3 text-text-muted hover:text-text-primary transition-colors"
          title="Close (Esc)"
        >
          <X size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {selectedExtracted ? (
          <ExtractedEntityView entity={selectedExtracted} />
        ) : selectedFeatures ? (
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

function ExtractedEntityView({ entity }: { entity: ExtractedEntity }) {
  const cm = CATEGORY_META[entity.category]

  return (
    <div className="space-y-4">
      {/* Category badge */}
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
          style={{ backgroundColor: `${cm.color}22`, color: cm.color, border: `1px solid ${cm.color}55` }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cm.color }} />
          {cm.label}
        </span>
        <span className="text-[10px] text-text-muted uppercase tracking-widest">
          {entity.source === 'pdfplumber' ? 'pdfplumber' : 'PyMuPDF'}
        </span>
      </div>

      {/* Extracted text */}
      <div>
        <p className="text-[10px] text-text-muted uppercase tracking-widest mb-1.5 flex items-center gap-1">
          <Tag size={9} />
          Extracted Text
        </p>
        <div className="bg-surface-3 rounded-lg px-3 py-2.5 border border-border">
          <p className="text-sm font-mono text-text-primary break-all leading-relaxed">
            {entity.text || <span className="text-text-muted italic">(empty)</span>}
          </p>
        </div>
      </div>

      {/* Confidence */}
      <div>
        <p className="text-[10px] text-text-muted uppercase tracking-widest mb-1.5 flex items-center gap-1">
          <Hash size={9} />
          Confidence
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-surface-3 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.round(entity.confidence * 100)}%`,
                backgroundColor: entity.confidence > 0.8 ? '#10b981' : entity.confidence > 0.5 ? '#f59e0b' : '#ef4444',
              }}
            />
          </div>
          <span className="text-[11px] font-mono text-text-muted w-8 text-right">
            {Math.round(entity.confidence * 100)}%
          </span>
        </div>
      </div>

      {/* Bounding box */}
      <div>
        <p className="text-[10px] text-text-muted uppercase tracking-widest mb-1.5 flex items-center gap-1">
          <Crosshair size={9} />
          Bounding Box (SVG coords)
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {(['x', 'y', 'width', 'height'] as const).map((k) => (
            <div key={k} className="bg-surface-3 rounded px-2.5 py-1.5 border border-border">
              <p className="text-[9px] text-text-muted uppercase tracking-wider">{k}</p>
              <p className="text-xs font-mono text-text-primary">
                {entity.bbox[k].toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Font metadata */}
      {(entity.meta?.fontSize || entity.meta?.fontName) && (
        <div>
          <p className="text-[10px] text-text-muted uppercase tracking-widest mb-1.5 flex items-center gap-1">
            <Database size={9} />
            Font Metadata
          </p>
          <div className="space-y-1">
            {entity.meta.fontName && (
              <div className="flex justify-between text-xs">
                <span className="text-text-muted">Font</span>
                <span className="font-mono text-text-primary truncate max-w-[60%]">{entity.meta.fontName}</span>
              </div>
            )}
            {entity.meta.fontSize && (
              <div className="flex justify-between text-xs">
                <span className="text-text-muted">Size</span>
                <span className="font-mono text-text-primary">{entity.meta.fontSize.toFixed(1)}pt</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Table data */}
      {entity.meta?.tableData && entity.meta.tableData.length > 0 && (
        <div>
          <p className="text-[10px] text-text-muted uppercase tracking-widest mb-1.5">Table Data</p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="text-[10px] w-full">
              <tbody>
                {entity.meta.tableData.map((row, ri) => (
                  <tr key={ri} className={ri % 2 === 0 ? 'bg-surface-3' : 'bg-surface-2'}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-2 py-1 border-r border-border last:border-r-0 font-mono text-text-primary whitespace-nowrap">
                        {cell ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Entity ID */}
      <p className="text-[9px] font-mono text-text-muted/50 break-all">{entity.id}</p>
    </div>
  )
}
