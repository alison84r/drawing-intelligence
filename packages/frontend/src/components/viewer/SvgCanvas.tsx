import { useEffect, useRef, useCallback } from 'react'
import { useViewerStore } from '../../store/viewerStore'
import { extractPathFeatures } from '../../lib/pathFeatures'
import { usePanzoom } from '../../hooks/usePanzoom'

/**
 * SvgCanvas — raw DOM injection + svg-pan-zoom
 *
 * svg-pan-zoom works directly on the SVG element's internal coordinate system
 * (adds a <g> wrapper, applies SVG transforms) rather than CSS transforms on a
 * wrapper div. This gives perfectly crisp, infinite-resolution rendering at any
 * zoom level since the browser's SVG engine handles all anti-aliasing.
 */
export default function SvgCanvas() {
  const hostRef = useRef<HTMLDivElement>(null)

  const svgContent = useViewerStore((s) => s.svgContent)
  const textHighlightActive = useViewerStore((s) => s.textHighlightActive)
  const selectedEntityId = useViewerStore((s) => s.selectedEntityId)
  const selectEntity = useViewerStore((s) => s.selectEntity)
  const clearSelection = useViewerStore((s) => s.clearSelection)

  const { init, fit, zoomIn, zoomOut, reset } = usePanzoom()

  // Expose controls on window for ZoomControls & keyboard shortcuts
  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__svgControls = {
      zoomIn,
      zoomOut,
      fit,
      reset,
    }
  }, [zoomIn, zoomOut, fit, reset])

  // Inject SVG, set up interactivity, initialize svg-pan-zoom
  useEffect(() => {
    const host = hostRef.current
    if (!host || !svgContent) return

    // Inject raw SVG — preserves embedded WOFF @font-face in <style> block
    host.innerHTML = svgContent

    const svgEl = host.querySelector('svg')
    if (!svgEl) return

    // svg-pan-zoom needs the SVG to fill its container
    svgEl.setAttribute('width', '100%')
    svgEl.setAttribute('height', '100%')
    svgEl.style.display = 'block'

    // Assign data-entity-id to every clickable element in one pass
    let idx = 0
    svgEl.querySelectorAll('path, text, image').forEach((el) => {
      el.setAttribute('data-entity-id', `entity-${idx++}`)
      ;(el as SVGElement).style.cursor = 'pointer'
    })

    // Inject crisp text highlight filter into <defs>
    // feMorphology dilates the alpha channel → sharp background at any zoom
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

    // Initialize svg-pan-zoom after SVG is in DOM (double-RAF ensures layout)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        init(svgEl as SVGSVGElement)
      })
    )
  }, [svgContent, init])

  // Delegated click handler — single listener, O(1) regardless of path count
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
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

  // Text highlight — single class toggle on SVG root
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
