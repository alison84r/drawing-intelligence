import { useCallback, useEffect, useRef, useState } from 'react'
import type { PDFPageProxy } from 'pdfjs-dist'
import { Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDocumentStore } from '@/store/documentStore'
import { useViewportStore } from '@/store/viewportStore'
import { useUiStore } from '@/store/uiStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useCharacteristicStore } from '@/store/characteristicStore'
import { screenToPage, type Point, type ScreenMap } from '@/lib/geometry'
import { cn } from '@/lib/utils'
import { PdfCanvas } from './PdfCanvas'
import { BalloonLayer } from './BalloonLayer'
import { TokenLayer } from './TokenLayer'
import { useRecognizeStore } from '@/store/recognizeStore'

const WHEEL_ZOOM_SENSITIVITY = 0.0015

export function DrawingSurface() {
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [page, setPage] = useState<PDFPageProxy | null>(null)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [panning, setPanning] = useState(false)
  const panLast = useRef<{ x: number; y: number } | null>(null)

  const status = useDocumentStore((s) => s.status)
  const error = useDocumentStore((s) => s.error)
  const doc = useDocumentStore((s) => s.doc)
  const pageIndex = useDocumentStore((s) => s.pageIndex)
  const openFile = useDocumentStore((s) => s.openFile)

  const scale = useViewportStore((s) => s.scale)
  const offsetX = useViewportStore((s) => s.offsetX)
  const offsetY = useViewportStore((s) => s.offsetY)
  const rotation = useViewportStore((s) => s.rotation)
  const setContainerSize = useViewportStore((s) => s.setContainerSize)
  const zoomAt = useViewportStore((s) => s.zoomAt)
  const panBy = useViewportStore((s) => s.panBy)
  const fit = useViewportStore((s) => s.fit)

  const tool = useUiStore((s) => s.tool)
  const setTool = useUiStore((s) => s.setTool)
  const leaderDefault = useSettingsStore((s) => s.leaderDefault)
  const pages = useDocumentStore((s) => s.pages)
  const addBalloon = useCharacteristicStore((s) => s.addBalloon)
  const selectBalloon = useCharacteristicStore((s) => s.select)
  const [hover, setHover] = useState<Point | null>(null)
  const setBand = useRecognizeStore((s) => s.setBand)
  const runRecognize = useRecognizeStore((s) => s.run)
  const bandStart = useRef<Point | null>(null)

  const pageSize = pages[pageIndex]
  const map: ScreenMap | null = pageSize ? { scale, offsetX, offsetY, rotation, size: pageSize } : null

  // Track the container size for fit and centred zoom. Measured directly on mount and on
  // window resize as well, because ResizeObserver callbacks are delayed in hidden or embedded views.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => {
      const { width, height } = el.getBoundingClientRect()
      if (width > 0 && height > 0) setContainerSize(width, height)
    }
    measure()
    // Panels settle over the first frames; measure again so the first fit uses the real size.
    const raf = requestAnimationFrame(measure)
    const late = window.setTimeout(measure, 300)
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(late)
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [setContainerSize])

  // Load the current page object when the document or page changes, then fit it once.
  const needsFit = useRef(false)
  useEffect(() => {
    let alive = true
    if (!doc) {
      setPage(null)
      return
    }
    doc.getPage(pageIndex + 1).then((p) => {
      if (!alive) return
      setPage(p)
      needsFit.current = true
      fit()
    })
    return () => {
      alive = false
    }
  }, [doc, pageIndex, fit])

  // Keep the sheet fitted while the space around it changes (panels opening, the grid resizing, the window),
  // for as long as the user has not zoomed or panned themselves. Their own view is never taken away.
  const containerW = useViewportStore((s) => s.containerW)
  const containerH = useViewportStore((s) => s.containerH)
  useEffect(() => {
    if (!page || containerW === 0 || containerH === 0) return
    const v = useViewportStore.getState()
    const untouched = v.lastFit !== null && v.lastFit.scale === v.scale && v.lastFit.offsetX === v.offsetX && v.lastFit.offsetY === v.offsetY
    if (needsFit.current || untouched) {
      needsFit.current = false
      fit()
    }
  }, [page, containerW, containerH, fit])

  // Space bar enables temporary panning.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        setSpaceHeld(true)
        e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // Wheel zooms around the cursor. Native listener so preventDefault works.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!doc) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * WHEEL_ZOOM_SENSITIVITY))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [doc, zoomAt])

  const panEnabled = tool === 'pan' || spaceHeld

  const localPoint = (e: React.PointerEvent): Point => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!doc) return
      const middle = e.button === 1
      if (panEnabled || middle) {
        e.preventDefault()
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        panLast.current = { x: e.clientX, y: e.clientY }
        setPanning(true)
        return
      }
      if (e.button !== 0 || !map) return
      if (tool === 'window') {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        const p = screenToPage(localPoint(e), map)
        bandStart.current = p
        setBand({ x: p.x, y: p.y, w: 0, h: 0 })
        return
      }
      if (tool === 'single' || tool === 'multiple') {
        addBalloon({ page: pageIndex, at: screenToPage(localPoint(e), map), leader: leaderDefault })
        if (tool === 'single') setTool('select')
        return
      }
      if (tool === 'select') {
        selectBalloon(null)
        useUiStore.getState().setSolo(null)
      }
    },
    [doc, panEnabled, map, tool, addBalloon, pageIndex, leaderDefault, setTool, selectBalloon, setBand],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (panLast.current) {
        panBy(e.clientX - panLast.current.x, e.clientY - panLast.current.y)
        panLast.current = { x: e.clientX, y: e.clientY }
        return
      }
      if (bandStart.current && map) {
        const p = screenToPage(localPoint(e), map)
        const s = bandStart.current
        setBand({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) })
        return
      }
      if (tool === 'single' || tool === 'multiple') setHover(localPoint(e))
    },
    [panBy, tool, map, setBand],
  )

  const endPan = useCallback(() => {
    panLast.current = null
    setPanning(false)
    if (bandStart.current) {
      bandStart.current = null
      const band = useRecognizeStore.getState().band
      setBand(null)
      if (band && band.w > 4 && band.h > 4) {
        void runRecognize({ region: band, pages: [pageIndex] })
        setTool('select')
      }
    }
  }, [setBand, runRecognize, pageIndex, setTool])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files?.[0]
      if (file) void openFile(file)
    },
    [openFile],
  )

  const cursor = panning
    ? 'cursor-grabbing'
    : panEnabled
      ? 'cursor-grab'
      : tool === 'single' || tool === 'multiple' || tool === 'window'
        ? 'cursor-crosshair'
        : 'cursor-default'

  return (
    <div
      ref={containerRef}
      className={cn('relative h-full w-full select-none overflow-hidden bg-muted/60', cursor)}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onPointerLeave={() => setHover(null)}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="drawing-surface"
    >
      {page && <PdfCanvas page={page} scale={scale} rotation={rotation} offsetX={offsetX} offsetY={offsetY} />}
      {page && map && <TokenLayer map={map} page={pageIndex} />}
      {page && map && <BalloonLayer map={map} page={pageIndex} hover={hover} leaderDefault={leaderDefault} />}

      {status !== 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div
            className={cn(
              'flex max-w-md flex-col items-center gap-3 rounded-lg border-2 border-dashed bg-background/70 px-10 py-12 text-center transition-colors',
              dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/30',
            )}
          >
            {status === 'loading' ? (
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            ) : (
              <Upload className="size-6 text-muted-foreground" />
            )}
            <p className="text-sm text-muted-foreground">
              {status === 'loading' ? 'Opening drawing…' : 'Drop a vector PDF here, or open one.'}
            </p>
            {status === 'error' && <p className="text-xs text-status-fail">{error}</p>}
            <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={status === 'loading'}>
              Open PDF
            </Button>
          </div>
        </div>
      )}

      {dragOver && status === 'ready' && (
        <div className="pointer-events-none absolute inset-0 border-4 border-primary/60 bg-primary/5" />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void openFile(file)
          e.target.value = ''
        }}
      />

    </div>
  )
}
