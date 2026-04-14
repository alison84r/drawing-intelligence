import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import { useViewerStore } from '../../store/viewerStore'
import { extractPathFeatures } from '../../lib/pathFeatures'
import { usePanzoom } from '../../hooks/usePanzoom'

/**
 * SvgCanvas — raw DOM injection + svg-pan-zoom.
 * Forwards its host div ref so parent components (e.g. ExtractionOverlay) can
 * inject elements into the SVG coordinate space.
 */
const SvgCanvas = forwardRef<HTMLDivElement, object>(
  function SvgCanvas(_props, ref) {
    const hostRef = useRef<HTMLDivElement>(null)

    // Forward ref to parent
    useImperativeHandle(ref, () => hostRef.current!, [])

    const svgContent = useViewerStore((s) => s.svgContent)
    const textHighlightActive = useViewerStore((s) => s.textHighlightActive)
    const selectedEntityId = useViewerStore((s) => s.selectedEntityId)
    const selectEntity = useViewerStore((s) => s.selectEntity)
    const clearSelection = useViewerStore((s) => s.clearSelection)

    const { init, fit, zoomIn, zoomOut, reset } = usePanzoom()

    // Expose controls on window for ZoomControls & keyboard shortcuts
    useEffect(() => {
      ;(window as unknown as Record<string, unknown>).__svgControls = {
        zoomIn, zoomOut, fit, reset,
      }
    }, [zoomIn, zoomOut, fit, reset])

    // Inject SVG, set up interactivity, initialize svg-pan-zoom
    useEffect(() => {
      const host = hostRef.current
      if (!host || !svgContent) return

      host.innerHTML = svgContent

      const svgEl = host.querySelector('svg')
      if (!svgEl) return

      svgEl.setAttribute('width', '100%')
      svgEl.setAttribute('height', '100%')
      svgEl.style.display = 'block'

      let idx = 0
      svgEl.querySelectorAll('path, text, image').forEach((el) => {
        el.setAttribute('data-entity-id', `entity-${idx++}`)
        ;(el as SVGElement).style.cursor = 'pointer'
      })

      // Inject crisp text highlight filter (feMorphology — sharp at any zoom)
      let defs = svgEl.querySelector('defs')
      if (!defs) {
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
        svgEl.prepend(defs)
      }
      if (!defs.querySelector('#txt-highlight')) {
        defs.insertAdjacentHTML(
          'beforeend',
          `<filter id="txt-highlight" x="-8%" y="-25%" width="116%" height="150%" color-interpolation-filters="sRGB">
            <feMorphology in="SourceAlpha" operator="dilate" radius="2" result="expanded"/>
            <feFlood flood-color="#fde047" flood-opacity="1" result="yellow"/>
            <feComposite in="yellow" in2="expanded" operator="in" result="bg"/>
            <feMerge>
              <feMergeNode in="bg"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>`
        )
      }

      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          init(svgEl as SVGSVGElement)
        })
      )
    }, [svgContent, init])

    // Delegated click handler
    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        // Ignore clicks on extraction overlay rects (they have their own handlers)
        const extractedTarget = (e.target as Element).closest('[data-extracted-id]')
        if (extractedTarget) return

        const target = (e.target as Element).closest('[data-entity-id]')
        if (!target) {
          clearSelection()
          return
        }
        const id = target.getAttribute('data-entity-id')!
        const features = extractPathFeatures(target as SVGElement, id)
        selectEntity(id, features)
      },
      [selectEntity, clearSelection]
    )

    // Selection highlight — direct DOM class, no React re-render
    useEffect(() => {
      const svgEl = hostRef.current?.querySelector('svg')
      if (!svgEl) return
      const prev = svgEl.querySelector('.entity-selected')
      prev?.classList.remove('entity-selected')
      if (selectedEntityId) {
        svgEl
          .querySelector(`[data-entity-id="${selectedEntityId}"]`)
          ?.classList.add('entity-selected')
      }
    }, [selectedEntityId])

    // Text highlight toggle
    useEffect(() => {
      const svgEl = hostRef.current?.querySelector('svg')
      if (!svgEl) return
      svgEl.classList.toggle('text-highlight-active', textHighlightActive)
    }, [textHighlightActive, svgContent])

    return (
      <div
        ref={hostRef}
        className="panzoom-host select-none"
        onClick={handleClick}
      />
    )
  }
)

export default SvgCanvas
