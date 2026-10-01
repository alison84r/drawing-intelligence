import { create } from 'zustand'
import { rotatedSize, type Rotation } from '@/lib/pdf'
import { useDocumentStore } from './documentStore'

export const MIN_SCALE = 0.1
export const MAX_SCALE = 8
const FIT_MARGIN = 24

/**
 * Screen mapping: screenX = offsetX + pageX * scale, where pageX is in rotated PDF points
 * and scale is CSS pixels per point. 1.0 means 72 dpi, shown as 100%.
 */
interface ViewportState {
  scale: number
  offsetX: number
  offsetY: number
  rotation: Rotation
  containerW: number
  containerH: number
  /** The view the last fit produced. While the view still equals it, the user has not zoomed or panned. */
  lastFit: { scale: number; offsetX: number; offsetY: number } | null
  setContainerSize: (w: number, h: number) => void
  zoomAt: (sx: number, sy: number, factor: number) => void
  zoomBy: (factor: number) => void
  setScale: (scale: number) => void
  panBy: (dx: number, dy: number) => void
  fit: () => void
  rotate: () => void
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export const useViewportStore = create<ViewportState>()((set, get) => ({
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  containerW: 0,
  containerH: 0,
  lastFit: null,

  setContainerSize: (containerW, containerH) => set({ containerW, containerH }),

  zoomAt: (sx, sy, factor) => {
    const { scale, offsetX, offsetY } = get()
    const next = clamp(scale * factor, MIN_SCALE, MAX_SCALE)
    if (next === scale) return
    const k = next / scale
    // Keep the page point under the cursor fixed.
    set({ scale: next, offsetX: sx - (sx - offsetX) * k, offsetY: sy - (sy - offsetY) * k })
  },

  zoomBy: (factor) => {
    const { containerW, containerH } = get()
    get().zoomAt(containerW / 2, containerH / 2, factor)
  },

  setScale: (scale) => {
    const { scale: cur } = get()
    get().zoomBy(clamp(scale, MIN_SCALE, MAX_SCALE) / cur)
  },

  panBy: (dx, dy) => set((s) => ({ offsetX: s.offsetX + dx, offsetY: s.offsetY + dy })),

  fit: () => {
    const { containerW, containerH, rotation } = get()
    const { pages, pageIndex } = useDocumentStore.getState()
    const size = pages[pageIndex]
    if (!size || containerW === 0 || containerH === 0) return
    const { width, height } = rotatedSize(size, rotation)
    const scale = clamp(
      Math.min((containerW - 2 * FIT_MARGIN) / width, (containerH - 2 * FIT_MARGIN) / height),
      MIN_SCALE,
      MAX_SCALE,
    )
    const offsetX = (containerW - width * scale) / 2
    const offsetY = (containerH - height * scale) / 2
    set({ scale, offsetX, offsetY, lastFit: { scale, offsetX, offsetY } })
  },

  rotate: () => {
    const next = ((get().rotation + 90) % 360) as Rotation
    set({ rotation: next })
    get().fit()
  },
}))
