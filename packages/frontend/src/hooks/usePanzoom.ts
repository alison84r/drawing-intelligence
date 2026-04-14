import { useRef, useCallback } from 'react'
import svgPanZoom from 'svg-pan-zoom'

type SvgPanZoomInstance = SvgPanZoom.Instance
import { useViewerStore } from '../store/viewerStore'

export interface PanzoomControls {
  init: (svgEl: SVGSVGElement) => void
  zoomIn: () => void
  zoomOut: () => void
  fit: () => void
  reset: () => void
}

export function usePanzoom(): PanzoomControls {
  const spzRef = useRef<SvgPanZoomInstance | null>(null)
  const setZoomLevel = useViewerStore((s) => s.setZoomLevel)

  const fit = useCallback(() => {
    if (!spzRef.current) return
    spzRef.current.fit()
    spzRef.current.center()
    setZoomLevel(spzRef.current.getZoom())
  }, [setZoomLevel])

  const init = useCallback(
    (svgEl: SVGSVGElement) => {
      // Destroy previous instance before re-initializing on new SVG content
      if (spzRef.current) {
        try { spzRef.current.destroy() } catch { /* ignore */ }
        spzRef.current = null
      }

      const instance = svgPanZoom(svgEl, {
        zoomEnabled: true,
        panEnabled: true,
        controlIconsEnabled: false,
        fit: true,
        center: true,
        minZoom: 0.02,
        maxZoom: 50,
        zoomScaleSensitivity: 0.25,
        mouseWheelZoomEnabled: true,
        preventMouseEventsDefault: true,
        dblClickZoomEnabled: true,
        onZoom(newZoom: number) {
          setZoomLevel(newZoom)
        },
      })

      spzRef.current = instance
      setZoomLevel(instance.getZoom())
    },
    [setZoomLevel]
  )

  const zoomIn = useCallback(() => {
    if (!spzRef.current) return
    spzRef.current.zoomIn()
    setZoomLevel(spzRef.current.getZoom())
  }, [setZoomLevel])

  const zoomOut = useCallback(() => {
    if (!spzRef.current) return
    spzRef.current.zoomOut()
    setZoomLevel(spzRef.current.getZoom())
  }, [setZoomLevel])

  const reset = useCallback(() => {
    if (!spzRef.current) return
    spzRef.current.reset()
    setZoomLevel(spzRef.current.getZoom())
  }, [setZoomLevel])

  return { init, fit, zoomIn, zoomOut, reset }
}
