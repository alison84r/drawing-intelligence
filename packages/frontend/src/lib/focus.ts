import { useCharacteristicStore } from '@/store/characteristicStore'
import { useDocumentStore } from '@/store/documentStore'
import { useRecognizeStore } from '@/store/recognizeStore'
import { useViewportStore } from '@/store/viewportStore'

interface View {
  scale: number
  offsetX: number
  offsetY: number
}

let previous: View | null = null
let focusedId: string | null = null

function centreOf(id: string): { x: number; y: number; page: number } | null {
  const c = useCharacteristicStore.getState().items.find((i) => i.id === id)
  if (!c) return null
  if (c.obox) return { x: c.obox.cx, y: c.obox.cy, page: c.page }
  if (c.bbox) return { x: c.bbox.x + c.bbox.w / 2, y: c.bbox.y + c.bbox.h / 2, page: c.page }
  return { x: c.anchor.x, y: c.anchor.y, page: c.page }
}

/**
 * Zoom to a characteristic so its text is readable; calling it again on the same one returns to the
 * view the user had before. Deliberate (double-click or F), never automatic.
 */
export function toggleZoomTo(id?: string | null): void {
  const target = id ?? useCharacteristicStore.getState().selectedId
  if (!target) return
  const vp = useViewportStore.getState()
  if (focusedId === target && previous) {
    vp.setScale(previous.scale)
    useViewportStore.setState({ offsetX: previous.offsetX, offsetY: previous.offsetY })
    previous = null
    focusedId = null
    return
  }
  const at = centreOf(target)
  if (!at) return
  if (!previous) previous = { scale: vp.scale, offsetX: vp.offsetX, offsetY: vp.offsetY }
  focusedId = target
  if (useDocumentStore.getState().pageIndex !== at.page) useDocumentStore.getState().setPageIndex(at.page)
  const textSize = useRecognizeStore.getState().pages[at.page]?.dimensionFontSize ?? 12
  const scale = Math.min(4, Math.max(vp.scale, 30 / textSize))
  vp.setScale(scale)
  const v = useViewportStore.getState()
  useViewportStore.setState({ offsetX: v.containerW / 2 - at.x * v.scale, offsetY: v.containerH / 2 - at.y * v.scale })
  useCharacteristicStore.getState().select(target)
}

/** Bring a selected balloon into view only when it is off screen. The zoom level is never changed. */
export function ensureVisible(id: string): void {
  const c = useCharacteristicStore.getState().items.find((i) => i.id === id)
  if (!c) return
  const v = useViewportStore.getState()
  if (v.rotation !== 0 || v.containerW === 0) return
  const sx = v.offsetX + c.balloonPos.x * v.scale
  const sy = v.offsetY + c.balloonPos.y * v.scale
  const margin = 36
  if (sx >= margin && sy >= margin && sx <= v.containerW - margin && sy <= v.containerH - margin) return
  useViewportStore.setState({ offsetX: v.containerW / 2 - c.balloonPos.x * v.scale, offsetY: v.containerH / 2 - c.balloonPos.y * v.scale })
}
