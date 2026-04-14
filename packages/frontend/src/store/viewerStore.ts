import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { PathFeatures, LoadingState, UploadState } from './types'

interface ViewerState {
  // SVG content
  svgContent: string | null
  svgFilename: string | null
  loadingState: LoadingState
  loadError: string | null

  // Zoom display (actual transform is in panzoom DOM, this is display only)
  zoomLevel: number

  // Selection
  selectedEntityId: string | null
  selectedFeatures: PathFeatures | null
  inspectorOpen: boolean

  // UI toggles
  textHighlightActive: boolean

  // Upload
  uploadState: UploadState
  uploadProgress: number
  uploadError: string | null
  uploadPanelOpen: boolean

  // Actions
  setSvgContent: (content: string, filename: string) => void
  setLoadingState: (state: LoadingState, error?: string) => void
  setZoomLevel: (level: number) => void
  selectEntity: (id: string, features: PathFeatures) => void
  clearSelection: () => void
  toggleTextHighlight: () => void
  setUploadState: (state: UploadState, progress?: number, error?: string) => void
  toggleUploadPanel: () => void
  closeUploadPanel: () => void
}

export const useViewerStore = create<ViewerState>()(
  immer((set) => ({
    svgContent: null,
    svgFilename: null,
    loadingState: 'idle',
    loadError: null,
    zoomLevel: 1,
    selectedEntityId: null,
    selectedFeatures: null,
    inspectorOpen: false,
    textHighlightActive: false,
    uploadState: 'idle',
    uploadProgress: 0,
    uploadError: null,
    uploadPanelOpen: false,

    setSvgContent: (content, filename) =>
      set((s) => {
        s.svgContent = content
        s.svgFilename = filename
        s.loadingState = 'ready'
        s.selectedEntityId = null
        s.selectedFeatures = null
        s.inspectorOpen = false
      }),

    setLoadingState: (state, error) =>
      set((s) => {
        s.loadingState = state
        s.loadError = error ?? null
      }),

    setZoomLevel: (level) =>
      set((s) => {
        s.zoomLevel = Math.round(level * 100) / 100
      }),

    selectEntity: (id, features) =>
      set((s) => {
        s.selectedEntityId = id
        s.selectedFeatures = features
        s.inspectorOpen = true
      }),

    clearSelection: () =>
      set((s) => {
        s.selectedEntityId = null
        s.selectedFeatures = null
        s.inspectorOpen = false
      }),

    toggleTextHighlight: () =>
      set((s) => {
        s.textHighlightActive = !s.textHighlightActive
      }),

    setUploadState: (state, progress, error) =>
      set((s) => {
        s.uploadState = state
        if (progress !== undefined) s.uploadProgress = progress
        s.uploadError = error ?? null
      }),

    toggleUploadPanel: () =>
      set((s) => {
        s.uploadPanelOpen = !s.uploadPanelOpen
      }),

    closeUploadPanel: () =>
      set((s) => {
        s.uploadPanelOpen = false
      }),
  }))
)
