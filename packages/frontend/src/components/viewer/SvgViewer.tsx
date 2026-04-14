import { useEffect } from 'react'
import SvgCanvas from './SvgCanvas'
import ZoomControls from './ZoomControls'
import EntityInspector from '../inspector/EntityInspector'
import PdfUploadPanel from '../upload/PdfUploadPanel'
import Toolbar from '../ui/Toolbar'
import StatusBar from '../ui/StatusBar'
import { useViewerStore } from '../../store/viewerStore'

type SvgControls = {
  zoomIn: () => void
  zoomOut: () => void
  fit: () => void
  reset: () => void
}

function getControls(): SvgControls | null {
  return (
    ((window as unknown as Record<string, unknown>).__svgControls as SvgControls) ?? null
  )
}

export default function SvgViewer() {
  const setSvgContent = useViewerStore((s) => s.setSvgContent)
  const setLoadingState = useViewerStore((s) => s.setLoadingState)
  const clearSelection = useViewerStore((s) => s.clearSelection)
  const toggleTextHighlight = useViewerStore((s) => s.toggleTextHighlight)

  // Load sample SVG on startup
  useEffect(() => {
    setLoadingState('loading')
    fetch('/sampleDrawingSvg.svg')
      .then((r) => r.text())
      .then((svg) => setSvgContent(svg, 'sampleDrawingSvg.svg'))
      .catch(() => setLoadingState('error', 'Failed to load sample drawing'))
  }, [setSvgContent, setLoadingState])

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as Element)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return

      switch (e.key) {
        case 'Escape':
          clearSelection()
          break
        case '+':
        case '=':
          getControls()?.zoomIn()
          break
        case '-':
          getControls()?.zoomOut()
          break
        case 'f':
        case 'F':
          getControls()?.fit()
          break
        case 'r':
        case 'R':
          getControls()?.reset()
          break
        case 't':
        case 'T':
          toggleTextHighlight()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clearSelection, toggleTextHighlight])

  return (
    <div className="flex flex-col h-full">
      <Toolbar />

      <div className="flex-1 relative overflow-hidden">
        <SvgCanvas />
        <ZoomControls />
        <EntityInspector />
        <PdfUploadPanel />
      </div>

      <StatusBar />
    </div>
  )
}
