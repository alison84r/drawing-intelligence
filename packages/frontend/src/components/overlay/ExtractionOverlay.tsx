import { useEffect, useRef, useState } from 'react'
import {
  useExtractionStore,
  CATEGORY_META,
  type ExtractedEntity,
} from '../../store/extractionStore'

const SVG_NS = 'http://www.w3.org/2000/svg'
const OVERLAY_GROUP_ID = 'extraction-overlay'

type TooltipState = {
  entity: ExtractedEntity
  x: number
  y: number
} | null

export default function ExtractionOverlay({
  svgHostRef,
}: {
  svgHostRef: React.RefObject<HTMLDivElement | null>
}) {
  const overlayGroupRef = useRef<SVGGElement | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState>(null)

  const result = useExtractionStore((s) => s.result)
  const overlayVisible = useExtractionStore((s) => s.overlayVisible)
  const sourcesVisible = useExtractionStore((s) => s.sourcesVisible)
  const categoriesVisible = useExtractionStore((s) => s.categoriesVisible)
  const selectedExtractedId = useExtractionStore((s) => s.selectedExtractedId)
  const selectExtracted = useExtractionStore((s) => s.selectExtracted)

  function getOrCreateOverlayGroup(svgEl: SVGSVGElement): SVGGElement {
    const existing = svgEl.querySelector(`#${OVERLAY_GROUP_ID}`)
    if (existing) return existing as SVGGElement

    const viewport =
      svgEl.querySelector('.svg-pan-zoom_viewport') ??
      svgEl.querySelector('g') ??
      svgEl

    const g = document.createElementNS(SVG_NS, 'g')
    g.id = OVERLAY_GROUP_ID
    g.setAttribute('pointer-events', 'all')
    viewport.appendChild(g)
    overlayGroupRef.current = g
    return g
  }

  useEffect(() => {
    const host = svgHostRef.current
    if (!host) return

    const svgEl = host.querySelector('svg') as SVGSVGElement | null
    if (!svgEl) return

    const overlayGroup = getOrCreateOverlayGroup(svgEl)
    while (overlayGroup.firstChild) overlayGroup.removeChild(overlayGroup.firstChild)

    if (!result || !overlayVisible) return

    // Render order: broad categories (table, titleblock) behind precise ones (dimension, tolerance, gdt)
    const Z_ORDER: Record<string, number> = {
      table: 0, table_cell: 0, grid_ref: 1, titleblock: 2,
      note: 3, unknown: 3, dimension: 4, tolerance: 5, gdt: 6,
    }
    const allEntities = [...result.entities, ...result.tables]
    const visible = allEntities
      .filter((e) => sourcesVisible[e.source] && categoriesVisible[e.category])
      .sort((a, b) => (Z_ORDER[a.category] ?? 3) - (Z_ORDER[b.category] ?? 3))

    for (const entity of visible) {
      const rect = document.createElementNS(SVG_NS, 'rect')
      const cm = CATEGORY_META[entity.category]
      const isSelected = entity.id === selectedExtractedId

      rect.setAttribute('x', String(entity.bbox.x))
      rect.setAttribute('y', String(entity.bbox.y))
      rect.setAttribute('width', String(entity.bbox.width))
      rect.setAttribute('height', String(entity.bbox.height))
      rect.setAttribute('fill', cm.color)
      rect.setAttribute('fill-opacity', isSelected ? '0.55' : String(cm.opacity))
      rect.setAttribute('stroke', isSelected ? '#ffffff' : cm.border)
      rect.setAttribute('stroke-width', isSelected ? '2' : '0.8')
      rect.setAttribute('stroke-opacity', '0.9')
      rect.setAttribute('rx', '1')
      rect.setAttribute('data-extracted-id', entity.id)
      rect.style.cursor = 'pointer'

      // Click → open inspector
      rect.addEventListener('click', (e) => {
        e.stopPropagation()
        setTooltip(null)
        selectExtracted(entity)
      })

      // Hover → show tooltip
      rect.addEventListener('mouseenter', (e) => {
        const me = e as MouseEvent
        setTooltip({ entity, x: me.clientX, y: me.clientY })
      })
      rect.addEventListener('mousemove', (e) => {
        const me = e as MouseEvent
        setTooltip((prev) => prev ? { ...prev, x: me.clientX, y: me.clientY } : null)
      })
      rect.addEventListener('mouseleave', () => setTooltip(null))

      overlayGroup.appendChild(rect)
    }
  }, [
    result,
    overlayVisible,
    sourcesVisible,
    categoriesVisible,
    selectedExtractedId,
    selectExtracted,
    svgHostRef,
  ])

  useEffect(() => {
    overlayGroupRef.current = null
  }, [result])

  // Floating tooltip — rendered in HTML space above the SVG
  if (!tooltip) return null

  const { entity, x, y } = tooltip
  const cm = CATEGORY_META[entity.category]

  // Keep tooltip inside the viewport
  const tipX = x + 14
  const tipY = y + 14

  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{ left: tipX, top: tipY }}
    >
      <div className="bg-surface-1 border border-border rounded-lg shadow-xl px-3 py-2 max-w-[260px]">
        {/* Category + source row */}
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold"
            style={{ backgroundColor: `${cm.color}22`, color: cm.color, border: `1px solid ${cm.color}44` }}
          >
            <span className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: cm.color }} />
            {cm.label}
          </span>
          <span className="text-[10px] text-text-muted">
            {entity.source === 'pdfplumber' ? 'pdfplumber' : 'PyMuPDF'}
          </span>
          <span className="text-[10px] text-text-muted ml-auto">
            {Math.round(entity.confidence * 100)}% conf
          </span>
        </div>

        {/* Extracted text */}
        {entity.text && (
          <p className="text-xs font-mono text-text-primary leading-snug truncate">
            {entity.text}
          </p>
        )}

        <p className="text-[9px] text-text-muted mt-1">Click to inspect</p>
      </div>
    </div>
  )
}
