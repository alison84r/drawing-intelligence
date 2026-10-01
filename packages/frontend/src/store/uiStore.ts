import { create } from 'zustand'
import type { WorkFilter } from '@/lib/progress'

export type ToolMode = 'select' | 'pan' | 'single' | 'multiple' | 'sub' | 'window'
export type BottomTab = 'boc' | 'part' | 'accountability'

interface UiState {
  tool: ToolMode
  leftCollapsed: boolean
  rightCollapsed: boolean
  bottomTab: BottomTab
  /** Which balloons the workspace shows. One list, filtered by where each balloon stands in the job. */
  show: WorkFilter
  setShow: (f: WorkFilter) => void
  settingsOpen: boolean
  setSettingsOpen: (v: boolean) => void
  /** Both side panels and the grid folded away, leaving the drawing. */
  focus: boolean
  toggleFocus: () => void
  /** Every grid column shown, not just the working set. */
  allColumns: boolean
  toggleAllColumns: () => void
  /** The filter row under the table headers. Off by default: the headers stay quiet. */
  gridFilters: boolean
  toggleGridFilters: () => void
  /** The table lifted over most of the drawing, for entering results. */
  gridTall: boolean
  toggleGridTall: () => void
  /** Characteristic under the pointer: its balloon or its callout text. */
  hoveredId: string | null
  setHovered: (id: string | null) => void
  /** Right-click menu for a balloon or row, in window coordinates. */
  contextMenu: { x: number; y: number; id: string } | null
  openContextMenu: (x: number, y: number, id: string) => void
  closeContextMenu: () => void
  /** "Show only this": every other balloon is hidden until the user clicks empty paper or presses Esc. */
  soloId: string | null
  setSolo: (id: string | null) => void
  setTool: (tool: ToolMode) => void
  toggleLeft: () => void
  toggleRight: () => void
  setLeftCollapsed: (v: boolean) => void
  setRightCollapsed: (v: boolean) => void
  setBottomTab: (tab: BottomTab) => void
}

export const useUiStore = create<UiState>()((set) => ({
  tool: 'select',
  leftCollapsed: false,
  rightCollapsed: false,
  bottomTab: 'boc',
  show: 'all',
  setShow: (show) => set({ show }),
  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  focus: false,
  toggleFocus: () => set((s) => ({ focus: !s.focus })),
  allColumns: false,
  toggleAllColumns: () => set((s) => ({ allColumns: !s.allColumns })),
  gridFilters: false,
  toggleGridFilters: () => set((s) => ({ gridFilters: !s.gridFilters })),
  gridTall: false,
  toggleGridTall: () => set((s) => ({ gridTall: !s.gridTall })),
  hoveredId: null,
  setHovered: (hoveredId) => set({ hoveredId }),
  contextMenu: null,
  openContextMenu: (x, y, id) => set({ contextMenu: { x, y, id } }),
  closeContextMenu: () => set({ contextMenu: null }),
  soloId: null,
  setSolo: (soloId) => set({ soloId }),
  setTool: (tool) => set({ tool }),
  toggleLeft: () => set((s) => ({ leftCollapsed: !s.leftCollapsed })),
  toggleRight: () => set((s) => ({ rightCollapsed: !s.rightCollapsed })),
  setLeftCollapsed: (leftCollapsed) => set({ leftCollapsed }),
  setRightCollapsed: (rightCollapsed) => set({ rightCollapsed }),
  setBottomTab: (bottomTab) => set({ bottomTab }),
}))
