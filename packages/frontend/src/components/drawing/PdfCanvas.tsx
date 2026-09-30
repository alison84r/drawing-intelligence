import { useEffect, useRef, useState } from 'react'
import type { PDFPageProxy, RenderTask } from 'pdfjs-dist'
import { renderPageRegion, type PageRegion, type Rotation } from '@/lib/pdf'
import { useViewportStore } from '@/store/viewportStore'

const RERENDER_DEBOUNCE_MS = 100
/** Extra area rendered around the visible window, as a fraction of it, so small pans show no gaps. */
const RENDER_MARGIN = 0.5

interface Props {
  page: PDFPageProxy
  scale: number
  rotation: Rotation
  offsetX: number
  offsetY: number
}

interface Snapshot {
  scale: number
  region: PageRegion
}

/**
 * Bitmap of the visible part of one page. Renders off-screen after the user stops moving,
 * then swaps the bitmap in atomically. Between renders the last bitmap is repositioned and
 * stretched with a CSS transform, so pan and zoom stay smooth at any zoom level.
 */
export function PdfCanvas({ page, scale, rotation, offsetX, offsetY }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const taskRef = useRef<RenderTask | null>(null)
  const firstRender = useRef(true)
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const containerW = useViewportStore((s) => s.containerW)
  const containerH = useViewportStore((s) => s.containerH)

  // Page size in CSS px at the current scale.
  const base = page.getViewport({ scale: 1, rotation })
  const pageW = base.width * scale
  const pageH = base.height * scale

  // Visible window in page-scaled px, grown by the margin and clipped to the page.
  const visible: PageRegion = {
    x: Math.max(0, -offsetX - containerW * RENDER_MARGIN),
    y: Math.max(0, -offsetY - containerH * RENDER_MARGIN),
    width: 0,
    height: 0,
  }
  visible.width = Math.min(pageW, -offsetX + containerW * (1 + RENDER_MARGIN)) - visible.x
  visible.height = Math.min(pageH, -offsetY + containerH * (1 + RENDER_MARGIN)) - visible.y

  const covered =
    snap !== null &&
    snap.scale === scale &&
    -offsetX >= snap.region.x &&
    -offsetY >= snap.region.y &&
    -offsetX + containerW <= snap.region.x + snap.region.width &&
    -offsetY + containerH <= snap.region.y + snap.region.height
  const onScreen = visible.width > 0 && visible.height > 0 && containerW > 0

  useEffect(() => {
    const target = canvasRef.current
    if (!target || !onScreen || covered) return
    let cancelled = false
    const delay = firstRender.current ? 0 : RERENDER_DEBOUNCE_MS
    firstRender.current = false
    const region = { ...visible }

    const timer = window.setTimeout(() => {
      taskRef.current?.cancel()
      const offscreen = document.createElement('canvas')
      const task = renderPageRegion(page, offscreen, scale, rotation, region)
      taskRef.current = task
      task.promise.then(
        () => {
          if (cancelled) return
          target.width = offscreen.width
          target.height = offscreen.height
          target.style.width = offscreen.style.width
          target.style.height = offscreen.style.height
          target.getContext('2d')?.drawImage(offscreen, 0, 0)
          setSnap({ scale, region })
        },
        () => {
          /* cancelled by a newer render */
        },
      )
    }, delay)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
    // `visible` is derived from these inputs; listing its fields keeps the effect precise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, scale, rotation, offsetX, offsetY, containerW, containerH, covered, onScreen])

  // A new page or rotation invalidates the bitmap immediately.
  useEffect(() => {
    setSnap(null)
    firstRender.current = true
  }, [page, rotation])

  useEffect(() => () => taskRef.current?.cancel(), [])

  // Place the snapshot where its top-left page point now sits on screen.
  const k = snap ? scale / snap.scale : 1
  const sx = snap ? offsetX + snap.region.x * k : offsetX
  const sy = snap ? offsetY + snap.region.y * k : offsetY

  return (
    <>
      <div
        className="absolute left-0 top-0 origin-top-left bg-white shadow-lg"
        style={{ transform: `translate(${offsetX}px, ${offsetY}px)`, width: pageW, height: pageH }}
        aria-hidden
      />
      <canvas
        ref={canvasRef}
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform: `translate(${sx}px, ${sy}px) scale(${k})`, visibility: snap ? 'visible' : 'hidden' }}
      />
    </>
  )
}
